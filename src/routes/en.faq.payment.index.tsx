import { createFileRoute } from "@tanstack/react-router";
import { FaqPaymentIndex } from "./faq.payment.index";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/faq/payment/")({
  head: () => ({
    meta: [
      { title: "USDT Payment Tutorials: MetaMask, Binance, OKX — FairDraw" },
      { name: "description", content: "FairDraw payment tutorials: MetaMask wallet payments, Binance withdrawals and OKX withdrawals, step by step." },
      { property: "og:title", content: "USDT Payment Tutorials — FairDraw" },
      { property: "og:type", content: "website" },
    ],
    links: i18nLinks("/faq/payment", "en"),
  }),
  component: FaqPaymentIndex,
});
