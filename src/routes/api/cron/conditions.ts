import { createFileRoute } from "@tanstack/react-router";

/**
 * Per-minute condition sweep, triggered by Supabase pg_cron (pg_net POST).
 * Auth: Authorization: Bearer ${CRON_SECRET}.
 *
 * Each run picks open campaigns whose campaign tweet is set, skips any checked
 * within the cooldown window, and re-runs the shared check pipeline (stats,
 * keyword, deleted-tweet cancel, snapshot, deadline auto-refund). Ordered by
 * ends_at so near-deadline campaigns refresh first.
 */
const BATCH_LIMIT = 20;
const COOLDOWN_MS = 50_000;

export const Route = createFileRoute("/api/cron/conditions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
          return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runConditionCheckCore } = await import("@/lib/campaign.functions");

        const { data: campaigns, error } = await supabaseAdmin
          .from("campaigns")
          .select("id, owner_id, status, ends_at, tweet_url, conditions, escrow_status, payment_method")
          .eq("status", "open")
          .not("tweet_url", "is", null)
          .order("ends_at", { ascending: true })
          .limit(200);
        if (error) return new Response(error.message, { status: 500 });
        if (!campaigns?.length) return Response.json({ due: 0, checked: 0, errors: 0 });

        // Latest snapshot per campaign doubles as the last-checked marker.
        const { data: snaps } = await supabaseAdmin
          .from("condition_snapshots")
          .select("campaign_id, fetched_at")
          .in("campaign_id", campaigns.map((c) => c.id))
          .order("fetched_at", { ascending: false })
          .limit(1000);
        const last = new Map<string, number>();
        for (const s of snaps ?? []) {
          if (!last.has(s.campaign_id)) last.set(s.campaign_id, Date.parse(s.fetched_at));
        }

        const due = campaigns
          .filter((c) => {
            const t = last.get(c.id);
            return !t || Date.now() - t > COOLDOWN_MS;
          })
          .slice(0, BATCH_LIMIT);

        let checked = 0;
        let errors = 0;
        for (const c of due) {
          try {
            await runConditionCheckCore(supabaseAdmin, c);
            checked++;
          } catch {
            errors++;
          }
        }
        return Response.json({ due: due.length, checked, errors });
      },
    },
  },
});
