import { createFileRoute } from "@tanstack/react-router";
import { Rankings } from "./rankings";
import { hubHostsQuery, impactSnapsQuery, publicHubQuery } from "@/lib/hub-queries";
import { i18nLinks } from "@/lib/seo";
import type { RankPeriod } from "@/lib/campaign-hub";
import type { ImpactMetric } from "@/lib/sponsor-ranking";

export const Route = createFileRoute("/en/rankings")({
  validateSearch: (search: Record<string, unknown>): { period: RankPeriod; metric: ImpactMetric } => ({
    period: search["period"] === "week" || search["period"] === "day" ? search["period"] : "month",
    metric: search["metric"] === "reach" || search["metric"] === "engagement" || search["metric"] === "growth" ? search["metric"] : "score",
  }),
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(publicHubQuery),
    context.queryClient.ensureQueryData(impactSnapsQuery),
    context.queryClient.ensureQueryData(hubHostsQuery),
  ]),
  head: () => ({
    meta: [
      { title: "FairDraw Community Impact Leaderboard — Top 50" },
      { name: "description", content: "Impact scores weighted by reach, engagement and follower growth — switch between monthly, weekly and daily boards." },
      { property: "og:title", content: "FairDraw Community Impact Leaderboard" },
      { property: "og:description", content: "Reach 40% · Engagement 35% · Growth 25% — percentile-scored community impact." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: i18nLinks("/rankings", "en"),
  }),
  component: Rankings,
});
