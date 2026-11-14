import { createFileRoute } from "@tanstack/react-router";
import { About } from "./about";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/about")({
  head: () => ({
    meta: [
      { title: "About FairDraw — Giveaway Assistant for X" },
      { name: "description", content: "FairDraw is a giveaway assistant for X (Twitter): it collects replies, filters out bots and draws winners on time. The entry list is public — anyone can re-run it. Prizes are held upfront." },
      { property: "og:title", content: "About FairDraw" },
      { property: "og:description", content: "FairDraw is a giveaway assistant for X (Twitter): replies collected, winners drawn on time, entry list public and re-runnable, prizes held upfront." },
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
