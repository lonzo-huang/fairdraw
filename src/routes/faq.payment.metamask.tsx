import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/faq/payment/metamask")({
  head: () => ({
    meta: [
      { title: "MetaMask 支付教程 — FairDraw" },
      { name: "description", content: "如何用 MetaMask 钱包向 FairDraw 支付 USDT（BEP20/BSC）：安装、添加网络、导入代币、发送转账完整步骤。" },
      { property: "og:title", content: "MetaMask 支付教程 — FairDraw" },
      { property: "og:type", content: "article" },
    ],
  }),
  component: FaqMetaMask,
});

function FaqMetaMask() {
  const { t } = useI18n();
  const steps: Array<{ title: string; desc: string }> = [
    { title: t("faq.mm.s1"), desc: t("faq.mm.s1d") },
    { title: t("faq.mm.s2"), desc: t("faq.mm.s2d") },
    { title: t("faq.mm.s3"), desc: t("faq.mm.s3d") },
    { title: t("faq.mm.s4"), desc: t("faq.mm.s4d") },
    { title: t("faq.mm.s5"), desc: t("faq.mm.s5d") },
  ];
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <Link to="/faq/payment" className="text-sm text-muted-foreground hover:text-foreground">{t("faq.pay.back")}</Link>
      <h1 className="mt-4 text-3xl font-semibold">{t("faq.mm.title")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{t("faq.mm.desc")}</p>

      <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        {t("faq.pay.network")}
      </div>

      <ol className="mt-8 space-y-6">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-4">
            <span className="steps-n flex-shrink-0">{i + 1}</span>
            <div>
              <div className="font-semibold">{s.title}</div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 text-sm text-muted-foreground">
        {t("faq.pay.need")}{" "}
        <a href="https://x.com/Mirrortekuk" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
          {t("faq.pay.needD")}
        </a>
      </div>
    </div>
  );
}
