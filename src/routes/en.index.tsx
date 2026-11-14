import { createFileRoute } from "@tanstack/react-router";
import { Index } from "./index";
import { hubDrawsQuery, hubHostsQuery, hubProgressQuery, publicHubQuery } from "@/lib/hub-queries";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/")({
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(publicHubQuery),
    context.queryClient.ensureQueryData(hubProgressQuery),
    context.queryClient.ensureQueryData(hubHostsQuery),
    context.queryClient.ensureQueryData(hubDrawsQuery),
  ]),
  head: () => ({
    meta: [
      { title: "FairDraw — Giveaway Assistant for X (Twitter)" },
      { name: "description", content: "Run X giveaways from one post link: FairDraw collects replies, filters bots and picks winners on time. Anyone can re-run the draw. Prizes held upfront." },
      { property: "og:title", content: "FairDraw · Giveaway Assistant for X" },
      { property: "og:description", content: "Paste one post link. Replies, winners and payouts — done." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: i18nLinks("/", "en"),
  }),
  component: Index,
});
