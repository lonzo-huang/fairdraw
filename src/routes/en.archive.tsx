import { createFileRoute } from "@tanstack/react-router";
import { ArchivePage } from "./archive";
import { publicHubQuery } from "@/lib/hub-queries";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/archive")({
  loader: ({ context }) => context.queryClient.ensureQueryData(publicHubQuery),
  head: ({ loaderData }) => ({
    meta: [
      { title: "Campaign Archive — FairDraw" },
      { name: "description", content: "FairDraw campaign archive: every drawn, cancelled and ended campaign on public record." },
      // Same rule as the zh route: simulated demos never lift the noindex.
      ...(((loaderData ?? []) as { status: string; ends_at: string; is_simulated?: boolean }[]).some(
        (c) => !c.is_simulated && (c.status === "drawn" || c.status === "cancelled" || Date.parse(c.ends_at) <= Date.now()),
      ) ? [] : [{ name: "robots", content: "noindex" }]),
      { property: "og:title", content: "Campaign Archive — FairDraw" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: i18nLinks("/archive", "en"),
  }),
  component: ArchivePage,
});
