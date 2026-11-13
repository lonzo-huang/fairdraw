import { createFileRoute } from "@tanstack/react-router";
import { About } from "./about";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/about")({
  head: () => ({
    meta: [
      { title: "About FairDraw — Verifiable X Giveaway Platform" },
      { name: "description", content: "FairDraw is a verifiable giveaway platform for X (Twitter): guaranteed prize pools, open-source deterministic draws, re-checkable results, published payout receipts." },
      { property: "og:title", content: "About FairDraw" },
      { property: "og:description", content: "FairDraw is a verifiable giveaway platform for X (Twitter): guaranteed prize pools, open-source draws, re-checkable results, published payout receipts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: i18nLinks("/about", "en"),
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "AboutPage",
        name: "About FairDraw",
        url: "https://www.fairdraw.win/en/about",
        about: { "@type": "Organization", name: "FairDraw", url: "https://www.fairdraw.win/" },
      }),
    }],
  }),
  component: About,
});
