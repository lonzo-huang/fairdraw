import { createFileRoute } from "@tanstack/react-router";
import { publicHubQuery } from "@/lib/hub-queries";
import { i18nLinks } from "@/lib/seo";
import { VerifyPage } from "./verify";

export const Route = createFileRoute("/en/verify")({
  loader: ({ context }) => context.queryClient.ensureQueryData(publicHubQuery),
  head: () => ({
    meta: [
      { title: "Check a draw — FairDraw" },
      { name: "description", content: "Paste a campaign ID or result link and re-run the FairDraw winner list yourself." },
      { property: "og:title", content: "Check a draw — FairDraw" },
      { property: "og:type", content: "website" },
    ],
    links: i18nLinks("/verify", "en"),
  }),
  component: VerifyPage,
});
