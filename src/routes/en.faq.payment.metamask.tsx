import { createFileRoute } from "@tanstack/react-router";
import { FaqMetaMask } from "./faq.payment.metamask";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/faq/payment/metamask")({
  head: () => ({
    meta: [
      { title: "MetaMask Payment Tutorial — FairDraw" },
      { name: "description", content: "How to pay FairDraw with MetaMask USDT (BEP20/BSC): install, add network, import token, send the transfer — step by step." },
      { property: "og:title", content: "MetaMask Payment Tutorial — FairDraw" },
      { property: "og:type", content: "article" },
    ],
    links: i18nLinks("/faq/payment/metamask", "en"),
  }),
  component: FaqMetaMask,
});
