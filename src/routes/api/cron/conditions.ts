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
/** Keep sweeping for a short grace after ends_at so the post-deadline
 *  auto-refund still fires; then the campaign drops out of the sweep. */
const END_GRACE_MS = 30 * 60_000;

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
          .gt("ends_at", new Date(Date.now() - END_GRACE_MS).toISOString())
          .order("ends_at", { ascending: true })
          .limit(200);
        if (error) return new Response(error.message, { status: 500 });
        if (!campaigns?.length) return Response.json({ due: 0, checked: 0, errors: 0 });

        // Latest snapshot per campaign doubles as the last-checked marker and
        // carries the per-field `missing` flags from the previous round.
        const { data: snaps } = await supabaseAdmin
          .from("condition_snapshots")
          .select("campaign_id, fetched_at, metrics")
          .in("campaign_id", campaigns.map((c) => c.id))
          .order("fetched_at", { ascending: false })
          .limit(1000);
        const last = new Map<string, { t: number; missing: boolean }>();
        for (const s of snaps ?? []) {
          if (!last.has(s.campaign_id)) {
            const miss = (s.metrics as { missing?: unknown } | null)?.missing;
            last.set(s.campaign_id, {
              t: Date.parse(s.fetched_at),
              missing: Array.isArray(miss) && miss.length > 0,
            });
          }
        }

        const due = campaigns
          .filter((c) => {
            const s = last.get(c.id);
            return !s || Date.now() - s.t > COOLDOWN_MS;
          })
          // Incomplete data retries first: never-snapshotted or still-missing
          // fields go ahead of complete campaigns, then by deadline.
          .sort((a, b) => {
            const prio = (id: string) => { const s = last.get(id); return !s || s.missing ? 1 : 0; };
            return prio(b.id) - prio(a.id) || Date.parse(a.ends_at) - Date.parse(b.ends_at);
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
