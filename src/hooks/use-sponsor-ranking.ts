import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePublicHub } from "@/hooks/use-public-hub";
import { liveSponsorRanking, sampleSponsorRanking, top50 } from "@/lib/sponsor-ranking";
import type { RankPeriod } from "@/lib/campaign-hub";

export function useSponsorRanking(period: RankPeriod, currency: string, sample: boolean) {
  const campaigns = usePublicHub();
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); }, []);
  const draws = useQuery({ queryKey: ["public-hub-draws"], queryFn: async () => {
    const { data, error } = await supabase.from("draws").select("campaign_id,winners,drawn_at");
    if (error) throw error; return data;
  }, refetchInterval: 15 * 60 * 1000 });
  const profiles = useQuery({ queryKey: ["public-hub-hosts"], queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("id,display_name");
    if (error) throw error; return data;
  }, refetchInterval: 15 * 60 * 1000 });
  return {
    rows: top50(sample ? sampleSponsorRanking(period) : liveSponsorRanking(campaigns.data ?? [], draws.data ?? [], now, period, currency, new Map((profiles.data ?? []).map((p) => [p.id, p.display_name])))),
    pending: !sample && (campaigns.isPending || draws.isPending || profiles.isPending),
    error: !sample && (campaigns.isError || draws.isError || profiles.isError),
  };
}