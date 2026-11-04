import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePublicHub } from "@/hooks/use-public-hub";
import { liveImpactRanking, sampleImpactRanking, topImpact, type ImpactMetric, type SnapLite } from "@/lib/sponsor-ranking";
import { fetchAllSnaps, periodStart, type RankPeriod } from "@/lib/campaign-hub";

export function useSponsorRanking(period: RankPeriod, metric: ImpactMetric, sample: boolean) {
  const campaigns = usePublicHub();
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); }, []);
  const snaps = useQuery({ queryKey: ["impact-snaps", period, new Date(periodStart(now || Date.now(), period)).toISOString()], enabled: !sample && now > 0, queryFn: () => {
    const from = new Date(periodStart(now, period)).toISOString();
    return fetchAllSnaps<SnapLite>((at, size) => supabase.from("condition_snapshots").select("campaign_id,fetched_at,metrics").gte("fetched_at", from).order("fetched_at", { ascending: true }).range(at, at + size - 1));
  }, refetchInterval: 15 * 60 * 1000 });
  const profiles = useQuery({ queryKey: ["public-hub-hosts"], queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("id,display_name");
    if (error) throw error; return data;
  }, refetchInterval: 15 * 60 * 1000 });
  return {
    rows: topImpact(
      sample ? sampleImpactRanking(period) : liveImpactRanking(campaigns.data ?? [], snaps.data ?? [], now, period, new Map((profiles.data ?? []).map((p) => [p.id, p.display_name]))),
      metric,
    ),
    pending: !sample && (campaigns.isPending || snaps.isPending || profiles.isPending || now === 0),
    error: !sample && (campaigns.isError || snaps.isError || profiles.isError),
  };
}