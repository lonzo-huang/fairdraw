import { useSuspenseQuery } from "@tanstack/react-query";
import { publicHubQuery } from "@/lib/hub-queries";

/**
 * Suspense query so SSR waits for the campaign rows — the rendered HTML carries
 * real cards instead of the loading skeleton. Data is ensured by route loaders.
 */
export function usePublicHub() {
  return useSuspenseQuery({ ...publicHubQuery, refetchInterval: 15 * 60 * 1000 });
}