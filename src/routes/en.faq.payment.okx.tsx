import { createFileRoute } from "@tanstack/react-router";
import { FaqOKX } from "./faq.payment.okx";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/en/faq/payment/okx")({
  head: () => ({
    meta: [
      { title: "OKX Payment Tutorial — FairDraw" },
      { name: "description", content: "Buy USDC on OKX and withdraw to the FairDraw address: pick X Layer (near-zero fee) or Base / Polygon / Arbitrum — about 2 minutes." },
      { property: "og:title", content: "OKX Payment Tutorial — FairDraw" },
      { property: "og:type", content: "article" },
    ],
    links: i18nLinks("/faq/payment/okx", "en"),
  }),
  component: FaqOKX,
});
