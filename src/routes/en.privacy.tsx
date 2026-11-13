import { createFileRoute } from "@tanstack/react-router";
import { Privacy } from "./privacy";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Notice — FairDraw" },
      { name: "description", content: "What data FairDraw collects, how it is used, and how long it is kept." },
      { property: "og:title", content: "Privacy Notice — FairDraw" },
      { property: "og:type", content: "website" },
    ],
    links: i18nLinks("/privacy", "en"),
  }),
  component: Privacy,
});
