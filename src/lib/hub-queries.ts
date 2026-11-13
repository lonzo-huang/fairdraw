import { supabase } from "@/integrations/supabase/client";
import { fetchAllSnaps } from "@/lib/campaign-hub";
import type { SnapLite } from "@/lib/sponsor-ranking";

/**
 * Shared public-data queries. Route loaders ensureQueryData() these so the
 * SSR stream already contains campaigns/rankings instead of "正在读取活动…" —
 * crawlers and AI scrapers get the real content, and the dehydrated
 * queryClient prevents a client refetch flash.
 */
export const publicHubQuery = {
  queryKey: ["public-campaign-hub"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("campaigns")
      .select("id,slug,title,prize,prize_amount,currency,winners_count,ends_at,created_at,status,escrow_status,tweet_url,owner_id,clicks,conditions,is_simulated")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
};


export const hubProgressQuery = {
  queryKey: ["public-hub-progress"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("condition_snapshots")
      .select("campaign_id,progress,fetched_at,metrics")
      .order("fetched_at", { ascending: false });
    if (error) throw error;
    // Cards only display the latest snapshot — dedupe here so the dehydrated
    // payload stays small even when a campaign has hundreds of history rows.
    const latest = new Map<string, (typeof data)[number]>();
    for (const row of data ?? []) if (!latest.has(row.campaign_id)) latest.set(row.campaign_id, row);
    return [...latest.values()];
  },
};

export const hubHostsQuery = {
  queryKey: ["public-hub-hosts"],
  queryFn: async () => {
    // Only campaign owners' names are ever rendered (card hosts, ranking fallback),
    // so fetching every profile row would bloat the dehydrated payload for no use.
    const campaigns = await publicHubQuery.queryFn();
    const ownerIds = [...new Set(campaigns.map((c) => c.owner_id).filter(Boolean))];
    if (!ownerIds.length) return [];
    const { data, error } = await supabase.from("profiles").select("id,display_name").in("id", ownerIds);
    if (error) throw error;
    return data;
  },
};

export const hubDrawsQuery = {
  queryKey: ["public-hub-draws"],
  queryFn: async () => {
    const { data, error } = await supabase.from("draws").select("campaign_id,winners,drawn_at");
    if (error) throw error;
    return data;
  },
};

/** Metrics fields the impact ranking actually reads — everything else
 *  (post_text, condition bookkeeping, retry state) stays server-side. */
const SNAP_FIELDS = [
  "likes", "replies", "reposts", "quotes", "bookmarks", "views",
  "followers", "author_handle", "author_name",
] as const;

const slimSnap = (s: SnapLite): SnapLite => {
  const m = s.metrics;
  if (!m || typeof m !== "object") return { ...s, metrics: null };
  const out: Record<string, unknown> = {};
  for (const k of SNAP_FIELDS) if (k in (m as Record<string, unknown>)) out[k] = (m as Record<string, unknown>)[k];
  return { campaign_id: s.campaign_id, fetched_at: s.fetched_at, metrics: out };
};

/** Latest snapshot per campaign inside a ~32-day window. The impact ranking
 *  only reads each campaign's last in-period row (reach/engagement/followers
 *  all come from it, and period membership is decided by its fetched_at), so
 *  shipping history rows would just bloat the dehydrated payload. */
export const impactSnapsQuery = {
  queryKey: ["impact-snaps"],
  queryFn: async () => {
    const nowIso = new Date().toISOString();
    const since = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString();
    const snaps = await fetchAllSnaps<SnapLite>((at, size) =>
      supabase
        .from("condition_snapshots")
        .select("campaign_id,fetched_at,metrics")
        .gte("fetched_at", since)
        .lte("fetched_at", nowIso)
        .order("fetched_at", { ascending: true })
        .range(at, at + size - 1));
    const latest = new Map<string, SnapLite>();
    for (const s of snaps) latest.set(s.campaign_id, s); // rows arrive asc → last wins
    return [...latest.values()].map(slimSnap);
  },
};
