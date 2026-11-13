import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { usePublicHub } from "@/hooks/use-public-hub";
import { liveImpactRanking, topImpact, type ImpactMetric } from "@/lib/sponsor-ranking";
import type { RankPeriod } from "@/lib/campaign-hub";
import { hubHostsQuery, impactSnapsQuery } from "@/lib/hub-queries";

export function useSponsorRanking(period: RankPeriod, metric: ImpactMetric) {
  const campaigns = usePublicHub();
  // Real clock from the start — the previous 0-init forced pending=true during
  // SSR, so crawlers only ever saw "正在读取活动…".
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); }, []);
  const snaps = useSuspenseQuery({ ...impactSnapsQuery, refetchInterval: 15 * 60 * 1000 });
  const profiles = useSuspenseQuery({ ...hubHostsQuery, refetchInterval: 15 * 60 * 1000 });
  return {
    rows: topImpact(
      liveImpactRanking(campaigns.data ?? [], snaps.data ?? [], now, period, new Map((profiles.data ?? []).map((p) => [p.id, p.display_name]))),
      metric,
    ),
    pending: campaigns.isPending || snaps.isPending || profiles.isPending || now === 0,
    error: campaigns.isError || snaps.isError || profiles.isError,
  };
}