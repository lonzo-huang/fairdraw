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
    const { data: entries, error: eErr } = await supabaseAdmin
      .from("entries")
      .select("id, handle, eligibility_status")
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
    // Conditions met at draw time: the pre-authorized prize pool is captured.
    await supabaseAdmin.from("campaigns").update({ status: "drawn", escrow_status: "charged" }).eq("id", c.id);
    await supabaseAdmin
      .from("payouts")
      .insert(result.winners.map((w) => ({ campaign_id: c.id, winner_handle: w.handle })));
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
      .select("id, post_url, platform")
      .in("id", data.entryIds);
    let found = 0;
    for (const e of entries ?? []) {
      let meta = null;
      try {
        meta = await fetchOembed(e.post_url, e.platform);
      } catch {
        meta = null;
      }
      if (meta) found++;
      await supabase
        .from("entries")
        .update({
          eligibility_status: meta ? "verified" : "unverified",
          verification_source: meta ? `${e.platform}-oembed` : "unavailable",
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
    const metrics: Metrics = { likes: null, replies: null, reposts: null, keyword_found: null, participants: 0, verified: 0 };

    if (c.tweet_url && conditions.keyword) {
      try {
        const meta = await fetchOembed(c.tweet_url, "x");
        metrics.keyword_found = meta?.text ? meta.text.toLowerCase().includes(conditions.keyword.toLowerCase()) : null;
      } catch {
        metrics.keyword_found = null;
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
    if (c.escrow_status !== "preauthorized") throw new Error("No pre-authorization to refund");
    if (new Date(c.ends_at).getTime() > Date.now()) throw new Error("Campaign still running");
    const { error: uErr } = await supabase.from("campaigns").update({ escrow_status: "refunded" }).eq("id", c.id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });
