import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/faq/payment/okx")({
  head: () => ({
    meta: [
      { title: "欧易 OKX 支付教程 — FairDraw" },
      { name: "description", content: "如何从欧易 OKX App 提币 USDT（BEP20）到 FairDraw：选链、填地址、确认到账完整步骤。" },
      { property: "og:title", content: "欧易 OKX 支付教程 — FairDraw" },
      { property: "og:type", content: "article" },
    ],
  }),
  component: FaqOKX,
});

function FaqOKX() {
  const { t } = useI18n();
  const steps: Array<{ title: string; desc: string }> = [
    { title: t("faq.okx.s1"), desc: t("faq.okx.s1d") },
    { title: t("faq.okx.s2"), desc: t("faq.okx.s2d") },
    { title: t("faq.okx.s3"), desc: t("faq.okx.s3d") },
    { title: t("faq.okx.s4"), desc: t("faq.okx.s4d") },
    { title: t("faq.okx.s5"), desc: t("faq.okx.s5d") },
  ];
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <Link to="/faq/payment" className="text-sm text-muted-foreground hover:text-foreground">{t("faq.pay.back")}</Link>
      <h1 className="mt-4 text-3xl font-semibold">{t("faq.okx.title")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{t("faq.okx.desc")}</p>

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
