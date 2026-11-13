import { createFileRoute } from "@tanstack/react-router";
import { Guide, GROUPS } from "./guide";
import { translate } from "@/lib/i18n";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/guide")({
  head: () => ({
    meta: [
      { title: "Growth Playbook — FairDraw" },
      { name: "description", content: "FairDraw guide: how the platform works, how to enter giveaways, and how provably fair draws and payouts work." },
      { property: "og:title", content: "Growth Playbook — FairDraw" },
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
