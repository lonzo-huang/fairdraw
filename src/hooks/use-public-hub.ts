import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePublicHub() {
  return useQuery({ queryKey: ["public-campaign-hub"], queryFn: async () => {
    const { data, error } = await supabase.from("campaigns").select("id,slug,title,prize,prize_amount,currency,winners_count,ends_at,created_at,status,tweet_url,owner_id,clicks,conditions").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }, refetchInterval: 15 * 60 * 1000 });
}