import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runDraw } from "@/lib/draw";
import { computeProgress, parseConditions, type Metrics } from "@/lib/conditions";
import type { Json } from "@/integrations/supabase/types";

/** Owner locks the candidate list and draws. Written with admin rights so owners cannot forge results. */
export const drawCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: c, error } = await supabase
      .from("campaigns")
      .select("id, owner_id, status, winners_count")
      .eq("id", data.campaignId)
      .single();
    if (error || !c) throw new Error("Campaign not found");
    if (c.owner_id !== userId) throw new Error("Forbidden");
    if (c.status === "drawn") throw new Error("Already drawn");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Real-money campaigns must be funded before the pool can be drawn.
    const { data: camp } = await supabaseAdmin
      .from("campaigns")
      .select("prize_amount, escrow_status, payment_method")
      .eq("id", c.id)
      .single();
    if (
      camp?.prize_amount &&
      (camp.payment_method === "stripe" || camp.payment_method === "chain") &&
      camp.escrow_status === "awaiting"
    ) {
      throw new Error("Prize pool is not funded yet");
    }

    const { data: entries, error: eErr } = await supabaseAdmin
      .from("entries")
      .select("id, handle, eligibility_status, payout_address")
      .eq("campaign_id", c.id)
      .neq("eligibility_status", "ineligible");
    if (eErr) throw new Error(eErr.message);
    const candidates = (entries ?? []).map((e) => ({ id: e.id, handle: e.handle }));
    if (candidates.length === 0) throw new Error("No eligible entries");

    const drawnAt = new Date().toISOString();
    const result = await runDraw(candidates, drawnAt, c.winners_count);

    const { error: dErr } = await supabaseAdmin.from("draws").insert({
      campaign_id: c.id,
      list_hash: result.listHash,
      seed: result.seed,
      drawn_at: drawnAt,
      candidates,
      winners: result.winners,
    });
    if (dErr) throw new Error(dErr.message);
    // Conditions met at draw time: the funded prize pool is captured for payout.
    await supabaseAdmin.from("campaigns").update({ status: "drawn", escrow_status: "charged" }).eq("id", c.id);
    const payoutAddr = new Map((entries ?? []).map((e) => [e.handle, e.payout_address]));
    await supabaseAdmin
      .from("payouts")
      .insert(result.winners.map((w) => ({ campaign_id: c.id, winner_handle: w.handle, wallet_address: payoutAddr.get(w.handle) ?? null })));
    return { ok: true };
  });

async function fetchOembed(url: string, platform: string) {
  const endpoint =
    platform === "x"
      ? `https://publish.twitter.com/oembed?omit_script=true&url=${encodeURIComponent(url)}`
      : platform === "youtube"
        ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
        : null;
  if (!endpoint) return null;
  const res = await fetch(endpoint, { headers: { "User-Agent": "FairDrawBot/1.0" } });
  if (!res.ok) return null;
  const j = (await res.json()) as { author_name?: string; author_url?: string; html?: string; title?: string };
  const text = j.html ? j.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400) : j.title;
  return { author_name: j.author_name ?? null, author_url: j.author_url ?? null, text: text ?? null };
}

/** Owner checks entries' posts. Unreadable posts stay "unverified" for manual review. */
export const checkEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entryIds: string[] }) => ({ entryIds: input.entryIds.slice(0, 50) }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // RLS: owners only see entries of their own campaigns.
    const { data: entries } = await supabase
      .from("entries")
      .select("id, post_url, platform, handle")
      .in("id", data.entryIds);
    const { fetchTweetStats } = await import("@/lib/x-stats.server");
    let found = 0;
    for (const e of entries ?? []) {
      let meta = null;
      let source = "unavailable";
      try {
        if (e.platform === "x") {
          const stats = await fetchTweetStats(e.post_url);
          if (stats) {
            meta = {
              author_name: stats.author_name,
              author_url: stats.author_handle ? `https://x.com/${stats.author_handle}` : null,
              text: stats.text,
              likes: stats.likes,
              replies: stats.replies,
              reposts: stats.reposts,
              views: stats.views,
            };
            source = stats.source;
          }
        }
        if (!meta) {
          meta = await fetchOembed(e.post_url, e.platform);
          if (meta) source = `${e.platform}-oembed`;
        }
      } catch {
        meta = null;
      }
      if (meta) {
        found++;
        // Does the post's author match the handle the entrant declared?
        // A mismatch usually means they pasted someone else's post.
        const m = /^https?:\/\/(www\.)?(x|twitter)\.com\/([A-Za-z0-9_]+)/.exec(
          (meta as { author_url?: string | null }).author_url ?? "",
        );
        meta = {
          ...(meta as Record<string, unknown>),
          handle_match: m?.[3] ? m[3].toLowerCase() === e.handle.trim().toLowerCase().replace(/^@/, "") : null,
        };
      }
      await supabase
        .from("entries")
        .update({
          eligibility_status: meta ? "verified" : "unverified",
          verification_source: source,
          fetched_meta: meta,
          fetched_at: new Date().toISOString(),
        })
        .eq("id", e.id);
    }
    return { checked: entries?.length ?? 0, found };
  });

/**
 * Owner refreshes condition progress. Reads the campaign tweet via public oEmbed
 * (keyword check) and counts participants/verified entries from our own database.
 * Like/reply/repost counts are not readable without X API access, so they stay
 * "unknown" for manual review. Every run stores a public snapshot.
 */
export const checkCampaignConditions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: c, error } = await supabase
      .from("campaigns")
      .select("id, owner_id, tweet_url, conditions")
      .eq("id", data.campaignId)
      .single();
    if (error || !c) throw new Error("Campaign not found");
    if (c.owner_id !== userId) throw new Error("Forbidden");

    const conditions = parseConditions(c.conditions);
    const metrics: Metrics = { likes: null, replies: null, reposts: null, quotes: null, views: null, keyword_found: null, participants: 0, verified: 0 };

    if (c.tweet_url) {
      // Real X stats first (API → public syndication); oEmbed remains the keyword fallback.
      try {
        const { fetchTweetStats } = await import("@/lib/x-stats.server");
        const stats = await fetchTweetStats(c.tweet_url);
        if (stats) {
          metrics.likes = stats.likes;
          metrics.replies = stats.replies;
          metrics.reposts = stats.reposts;
          metrics.quotes = stats.quotes;
          metrics.views = stats.views;
          if (conditions.keyword && stats.text) {
            metrics.keyword_found = stats.text.toLowerCase().includes(conditions.keyword.toLowerCase());
          }
        }
      } catch {
        /* stats unreadable — fields stay null */
      }
      if (conditions.keyword && metrics.keyword_found === null) {
        try {
          const meta = await fetchOembed(c.tweet_url, "x");
          metrics.keyword_found = meta?.text ? meta.text.toLowerCase().includes(conditions.keyword.toLowerCase()) : null;
        } catch {
          metrics.keyword_found = null;
        }
      }
    }

    const { data: counts } = await supabase
      .from("entries")
      .select("eligibility_status")
      .eq("campaign_id", c.id);
    for (const e of counts ?? []) {
      metrics.participants++;
      if (e.eligibility_status === "verified" || e.eligibility_status === "eligible") metrics.verified++;
    }

    const { checks, progress } = computeProgress(conditions, metrics);
    await supabase.from("condition_snapshots").insert({
      campaign_id: c.id,
      metrics: metrics as unknown as Json,
      progress,
    });
    return { checks, progress, metrics };
  });

/** Owner refunds the pre-authorized pool when the campaign ended without a draw. */
export const refundEscrow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: c, error } = await supabase
      .from("campaigns")
      .select("id, owner_id, status, ends_at, escrow_status")
      .eq("id", data.campaignId)
      .single();
    if (error || !c) throw new Error("Campaign not found");
    if (c.owner_id !== userId) throw new Error("Forbidden");
    if (c.status === "drawn") throw new Error("Already drawn");
    const refundable = c.escrow_status === "preauthorized" || c.escrow_status === "funded";
    if (!refundable) throw new Error("No funded pool to refund");
    if (new Date(c.ends_at).getTime() > Date.now()) throw new Error("Campaign still running");

    const { data: camp } = await supabase
      .from("campaigns")
      .select("payment_method")
      .eq("id", c.id)
      .single();

    if (camp?.payment_method === "stripe" && c.escrow_status === "funded") {
      // Real Stripe refund of the captured pool payment.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: pay } = await supabaseAdmin
        .from("payments")
        .select("external_ref")
        .eq("campaign_id", c.id)
        .eq("provider", "stripe")
        .eq("kind", "pool")
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!pay?.external_ref) throw new Error("No confirmed Stripe payment found");
      const { stripe } = await import("@/lib/stripe.server");
      const session = await stripe().checkout.sessions.retrieve(pay.external_ref);
      const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (!pi) throw new Error("Stripe payment intent not found");
      const refund = await stripe().refunds.create({ payment_intent: pi });
      await supabaseAdmin.from("payments").insert({
        campaign_id: c.id,
        user_id: userId,
        provider: "stripe",
        kind: "refund",
        status: refund.status === "succeeded" || refund.status === "pending" ? "confirmed" : "pending",
        amount: (refund.amount ?? 0) / 100,
        currency: refund.currency?.toUpperCase() ?? "USD",
        external_ref: refund.id,
      });
    } else if (camp?.payment_method === "chain" && c.escrow_status === "funded") {
      throw new Error("On-chain refunds are executed by the platform admin — please contact support");
    }

    const { error: uErr } = await supabase.from("campaigns").update({ escrow_status: "refunded" }).eq("id", c.id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });
