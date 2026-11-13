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
      { title: "FairDraw — Verifiable X (Twitter) Giveaway Platform" },
      { name: "description", content: "Set engagement thresholds with a guaranteed prize pool and grow your audience with provably fair, re-computable draws." },
      { property: "og:title", content: "FairDraw — Verifiable X (Twitter) Giveaway Platform" },
      { property: "og:description", content: "Set engagement thresholds with a guaranteed prize pool and grow your audience with provably fair, re-computable draws." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: i18nLinks("/", "en"),
  }),
  component: Index,
});
