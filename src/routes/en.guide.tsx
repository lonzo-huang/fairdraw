import { createFileRoute } from "@tanstack/react-router";
import { Guide, GROUPS } from "./guide";
import { translate } from "@/lib/i18n";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/guide")({
  head: () => ({
    meta: [
      { title: "How to Run a Giveaway on X — FairDraw Guide" },
      { name: "description", content: "FairDraw guide: launch a giveaway, set entry conditions, draw and pay out — plus how to enter and claim prizes." },
      { property: "og:title", content: "FairDraw Guide — Giveaways on X" },
      { property: "og:type", content: "website" },
    ],
    links: i18nLinks("/guide", "en"),
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: GROUPS.flatMap((g) => g.q.map((q) => ({ "@type": "Question", name: translate("en", q.q), acceptedAnswer: { "@type": "Answer", text: translate("en", q.a) } }))),
      }),
    }],
  }),
  component: Guide,
});
