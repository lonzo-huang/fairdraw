import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { Wallet, Building2, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/faq/payment/")({
  head: () => ({
    meta: [
      { title: "加密支付教程 — FairDraw" },
      { name: "description", content: "FairDraw 支付教程：MetaMask 钱包支付、币安提币、欧易提币完整步骤说明。" },
      { property: "og:title", content: "加密支付教程 — FairDraw" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: FaqPaymentIndex,
});

const PLATFORMS = [
  {
    slug: "metamask",
    icon: <Wallet className="size-6" />,
    color: "#e88100",
    titleZh: "MetaMask 钱包",
    titleEn: "MetaMask Wallet",
    descZh: "适合有加密钱包的用户，支持浏览器插件与手机 App",
    descEn: "For users with a self-custody wallet — browser extension or mobile app",
  },
  {
    slug: "binance",
    icon: <Building2 className="size-6" />,
    color: "#f0b90b",
    titleZh: "币安 Binance",
    titleEn: "Binance",
    descZh: "从币安交易所 App 直接提币，手续费约 1 USDT",
    descEn: "Withdraw directly from the Binance app (~1 USDT fee)",
  },
  {
    slug: "okx",
    icon: <Building2 className="size-6" />,
    color: "#fff",
    titleZh: "欧易 OKX",
    titleEn: "OKX",
    descZh: "从欧易交易所 App 提币，操作与币安类似",
    descEn: "Withdraw from OKX — similar flow to Binance",
  },
];

function FaqPaymentIndex() {
  const { t, lang } = useI18n();
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <h1 className="text-3xl font-semibold">{t("faq.pay.title")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{t("faq.pay.sub")}</p>

      <div className="mt-10 space-y-4">
        {PLATFORMS.map((p) => (
          <Link
            key={p.slug}
            to={`/faq/payment/${p.slug}` as never}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-card/80"
          >
            <span style={{ color: p.color }} className="flex-shrink-0">{p.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{lang === "zh" ? p.titleZh : p.titleEn}</div>
              <div className="mt-0.5 text-sm text-muted-foreground">{lang === "zh" ? p.descZh : p.descEn}</div>
            </div>
            <ArrowRight className="size-4 flex-shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>

      <div className="mt-10 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        {t("faq.pay.network")}
      </div>

      <div className="mt-6 text-sm text-muted-foreground">
        {t("faq.pay.need")}{" "}
        <a href="https://x.com/Mirrortekuk" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
          {t("faq.pay.needD")}
        </a>
      </div>
    </div>
  );
}
