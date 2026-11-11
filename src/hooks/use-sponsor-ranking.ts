import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePublicHub } from "@/hooks/use-public-hub";
import { liveImpactRanking, topImpact, type ImpactMetric, type SnapLite } from "@/lib/sponsor-ranking";
import { fetchAllSnaps, type RankPeriod } from "@/lib/campaign-hub";

export function useSponsorRanking(period: RankPeriod, metric: ImpactMetric) {
  const campaigns = usePublicHub();
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); }, []);
  // All snapshots: the ranking needs the pre-period baseline to compute deltas.
  const snaps = useQuery({ queryKey: ["impact-snaps"], enabled: now > 0, queryFn: () =>
    fetchAllSnaps<SnapLite>((at, size) => supabase.from("condition_snapshots").select("campaign_id,fetched_at,metrics").order("fetched_at", { ascending: true }).range(at, at + size - 1)),
    refetchInterval: 15 * 60 * 1000 });
  const profiles = useQuery({ queryKey: ["public-hub-hosts"], queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("id,display_name");
    if (error) throw error; return data;
  }, refetchInterval: 15 * 60 * 1000 });
  return {
    rows: topImpact(
      liveImpactRanking(campaigns.data ?? [], snaps.data ?? [], now, period, new Map((profiles.data ?? []).map((p) => [p.id, p.display_name]))),
      metric,
    ),
    pending: campaigns.isPending || snaps.isPending || profiles.isPending || now === 0,
    error: campaigns.isError || snaps.isError || profiles.isError,
  };
}