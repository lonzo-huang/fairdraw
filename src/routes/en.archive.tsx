import { createFileRoute } from "@tanstack/react-router";
import { ArchivePage } from "./archive";
import { publicArchiveQuery } from "@/lib/hub-queries";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/archive")({
  loader: ({ context }) => context.queryClient.ensureQueryData(publicArchiveQuery),
  head: () => ({
    meta: [
      { title: "Campaign Archive — FairDraw" },
      { name: "description", content: "FairDraw campaign archive: every drawn, cancelled and ended campaign on public record." },
      { property: "og:title", content: "Campaign Archive — FairDraw" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: i18nLinks("/archive", "en"),
  }),
  component: ArchivePage,
});
