import { createFileRoute } from "@tanstack/react-router";
import { FaqBinance } from "./faq.payment.binance";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/faq/payment/binance")({
  head: () => ({
    meta: [
      { title: "Binance Payment Tutorial — FairDraw" },
      { name: "description", content: "How to withdraw USDT (BEP20) from Binance to FairDraw: pick the network, paste the address, confirm — step by step." },
      { property: "og:title", content: "Binance Payment Tutorial — FairDraw" },
      { property: "og:type", content: "article" },
    ],
    links: i18nLinks("/faq/payment/binance", "en"),
  }),
  component: FaqBinance,
});
