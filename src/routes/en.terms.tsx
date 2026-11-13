import { createFileRoute } from "@tanstack/react-router";
import { Terms } from "./terms";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — FairDraw" },
      { name: "description", content: "FairDraw platform rules, prize-pool and refund policy." },
      { property: "og:title", content: "Terms of Service — FairDraw" },
      { property: "og:type", content: "website" },
    ],
    links: i18nLinks("/terms", "en"),
  }),
  component: Terms,
});
