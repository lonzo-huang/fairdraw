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

// ── 教程内容 ────────────────────────────────────────────
const CONTENT_ZH = (
  <>
    <p>通过欧易 OKX App 的「链上提币」功能向平台收款地址支付 USDT，全程约 2 分钟。</p>
    <ol className="list-decimal space-y-3 pl-5">
      <li>打开欧易 App，点底部「资产」→「提币」，搜索并选择 <b>USDT</b>。</li>
      <li>提币方式选择<b>「链上提币」</b>（不要选「站内转账」——那只能在欧易用户之间转）。</li>
      <li>收款地址栏粘贴 FairDraw 付款页显示的充值地址（0x 开头），或点扫码图标直接扫描页面上的二维码。</li>
      <li>提币网络选择 <b>USDT-BSC（BNB Smart Chain / BEP20）</b>。</li>
      <li>输入提币金额：欧易从提币金额中扣除手续费，页面会显示「预计到账」金额——请确保预计到账 ≥ 应付总额，不足就把提币金额调大。</li>
      <li>确认提币，输入资金密码并完成短信 / 谷歌二次验证。</li>
      <li>等待到账（通常 1–3 分钟），然后到「资产 → 提币记录」找到该笔，复制 TXID（0x 开头的交易哈希）。</li>
      <li>回到 FairDraw 付款页，把 TXID 粘贴进输入框并点「确认支付」，系统核验后活动即开通。</li>
    </ol>
    <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      ⚠️ 注意：提币网络必须选 BSC / BEP20。如果选了 ERC20、TRC20 等其他网络，资金将无法到达平台地址且无法找回。
    </p>
  </>
);
const CONTENT_EN = (
  <>
    <p>Use OKX's on-chain withdrawal to send USDT to the platform deposit address — takes about 2 minutes.</p>
    <ol className="list-decimal space-y-3 pl-5">
      <li>Open the OKX app, tap <b>Assets</b> (bottom tab) → <b>Withdraw</b>, then search and select <b>USDT</b>.</li>
      <li>Choose <b>On-chain withdrawal</b> (do NOT choose internal transfer — that only works between OKX accounts).</li>
      <li>Paste the deposit address shown on the FairDraw payment page (starts with 0x), or tap the scan icon to scan the QR code.</li>
      <li>Select network <b>USDT-BSC (BNB Smart Chain / BEP20)</b>.</li>
      <li>Enter the amount: OKX deducts the network fee from your withdrawal — the page shows the estimated amount to receive. Make sure it covers the total due; increase the withdrawal amount if needed.</li>
      <li>Confirm, enter your funding password, and complete SMS / Google 2FA verification.</li>
      <li>Wait 1–3 minutes, then find the transaction under <b>Assets → Withdrawal history</b> and copy the TXID (starts with 0x).</li>
      <li>Back on the FairDraw payment page, paste the TXID and tap Confirm — the campaign activates once verified.</li>
    </ol>
    <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      ⚠️ The network must be BSC / BEP20. Choosing ERC20, TRC20 or any other network means the funds will never reach our address and cannot be recovered.
    </p>
  </>
);
// ────────────────────────────────────────────────────────

function FaqOKX() {
  const { t, lang } = useI18n();
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <Link to="/guide" className="text-sm text-muted-foreground hover:text-foreground">{t("faq.pay.back")}</Link>
      <h1 className="mt-4 text-3xl font-semibold">{t("faq.okx.title")}</h1>

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
