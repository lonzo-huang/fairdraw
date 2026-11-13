import { createFileRoute } from "@tanstack/react-router";
import { AffiliateLanding } from "./affiliate";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/affiliate")({
  head: () => ({
    meta: [
      { title: "Affiliate Program — FairDraw · earn 30% of net revenue" },
      { name: "description", content: "Refer organisers to FairDraw and earn 30% of net revenue (service fee minus direct costs) for 12 months, settled on-chain in USDT." },
      { property: "og:title", content: "FairDraw Affiliate Program — 30% of net revenue" },
    ],
    links: i18nLinks("/affiliate", "en"),
  }),
  component: AffiliateLanding,
});
