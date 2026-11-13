import { createFileRoute } from "@tanstack/react-router";
import { Contact } from "./contact";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/contact")({
  head: () => ({
    meta: [
      { title: "Contact — FairDraw" },
      { name: "description", content: "Reach FairDraw: campaign questions, draw disputes, partnership enquiries." },
      { property: "og:type", content: "website" },
    ],
    links: i18nLinks("/contact", "en"),
  }),
  component: Contact,
});
