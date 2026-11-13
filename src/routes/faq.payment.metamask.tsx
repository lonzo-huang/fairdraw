import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/faq/payment/metamask")({
  head: () => ({
    meta: [
      { title: "MetaMask 支付教程 — FairDraw" },
      { name: "description", content: "如何用 MetaMask 钱包向 FairDraw 支付 USDT（BEP20/BSC）：安装、添加网络、导入代币、发送转账完整步骤。" },
      { property: "og:title", content: "MetaMask 支付教程 — FairDraw" },
      { property: "og:type", content: "article" },
    ],
    links: i18nLinks("/faq/payment/metamask"),
  }),
  component: FaqMetaMask,
});

// ── 教程内容（待替换为正式操作指导文案）────────────────
const CONTENT_ZH = <p>教程内容整理中…</p>;
const CONTENT_EN = <p>Tutorial content coming soon…</p>;
// ────────────────────────────────────────────────────────

export function FaqMetaMask() {
  const { t, lang, lp } = useI18n();
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <Link to={lp("/faq/payment") as never} className="text-sm text-muted-foreground hover:text-foreground">{t("faq.pay.back")}</Link>
      <h1 className="mt-4 text-3xl font-semibold">{t("faq.mm.title")}</h1>

      <article className="mt-8 space-y-4 text-sm leading-6 text-muted-foreground">
        {lang === "zh" ? CONTENT_ZH : CONTENT_EN}
      </article>

      <div className="mt-10 text-sm text-muted-foreground">
        {t("faq.pay.need")}{" "}
        <a href="https://x.com/Mirrortekuk" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
          {t("faq.pay.needD")}
        </a>
      </div>
    </div>
  );
}
