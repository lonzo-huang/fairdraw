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

/**
 * Archive-only query: simulated campaigns are demos, not public history.
 * Filtering inside queryFn keeps them out of the dehydrated payload entirely —
 * the public hub query deliberately keeps them for the sim/real badge.
 */
export const publicArchiveQuery = {
  queryKey: ["public-campaign-archive"],
  queryFn: async () => {
    const data = await publicHubQuery.queryFn();
    return data.filter((c) => !c.is_simulated);
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
    const { data, error } = await supabase.from("profiles").select("id,display_name");
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

/** All snapshots — the impact ranking needs the pre-period baseline for deltas. */
export const impactSnapsQuery = {
  queryKey: ["impact-snaps"],
  queryFn: () =>
    fetchAllSnaps<SnapLite>((at, size) =>
      supabase
        .from("condition_snapshots")
        .select("campaign_id,fetched_at,metrics")
        .order("fetched_at", { ascending: true })
        .range(at, at + size - 1)),
};
