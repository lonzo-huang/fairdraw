import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useFeeTiers() {
  return useQuery({ queryKey: ["fee-tiers"], queryFn: async () => {
    const { data, error } = await supabase.from("fee_tiers").select("id,min_amount,rate_percent").order("min_amount");
    if (error) throw error;
    return data.map((r) => ({ ...r, min_amount: Number(r.min_amount), rate_percent: Number(r.rate_percent) }));
  } });
}
