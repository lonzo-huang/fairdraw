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
    <p>用欧易 OKX App 扫描付款页二维码（或手动发起链上转账）向平台收款地址支付 USDT，全程约 2 分钟。</p>
    <ol className="list-decimal space-y-3 pl-5">
      <li>先确认账户持有 USDT 且在<b>资金账户</b>里——欧易的链上转账只能从资金账户出。如果发起转账时看到「暂无资产可发送」，到「资产 → 划转」把 USDT 从交易账户划到资金账户；没有 USDT 则先在「买币」中购买。</li>
      <li>打开欧易 App 的扫一扫，扫描 FairDraw 付款页的二维码，收款地址会自动填入（也可手动粘贴 0x 开头的地址）。</li>
      <li>收款账户类型选择<b>「交易所或平台」</b>。</li>
      <li>网络选择 <b>BNB Chain</b>（即 BSC / BEP20）。</li>
      <li>币种选 USDT 并输入金额：手续费从发送金额中扣除，页面显示预计到账——请确保到账 ≥ 应付总额，不足就调大发送金额。</li>
      <li>确认转账，完成资金密码和二次验证。</li>
      <li>等待到账（通常 1–3 分钟），然后到「资产 → 提币记录」找到该笔，复制 TXID（0x 开头的交易哈希）。</li>
      <li>回到 FairDraw 付款页，把 TXID 粘贴进输入框并点「确认支付」，系统核验后活动即开通。</li>
    </ol>
    <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      ⚠️ 注意：网络必须选 BNB Chain（BEP20）。选 Ethereum、Polygon 等其他网络，资金不会到达平台地址且无法找回。
    </p>
  </>
);
const CONTENT_EN = (
  <>
    <p>Scan the QR code on the payment page with the OKX app (or start an on-chain transfer manually) to send USDT to the platform deposit address — takes about 2 minutes.</p>
    <ol className="list-decimal space-y-3 pl-5">
      <li>Make sure you hold USDT in your <b>Funding account</b> — OKX on-chain transfers can only send from it. If you see "no assets available to send", go to <b>Assets → Transfer</b> to move USDT from your Trading account to the Funding account; if you have no USDT, buy some first via Buy Crypto.</li>
      <li>Open the OKX app's scanner and scan the QR code on the FairDraw payment page — the deposit address fills in automatically (or paste the 0x address manually).</li>
      <li>For recipient account type, choose <b>Exchange or platform</b>.</li>
      <li>Select network <b>BNB Chain</b> (i.e. BSC / BEP20).</li>
      <li>Pick USDT and enter the amount: the network fee is deducted from what you send — the page shows the estimated amount to arrive. Make sure it covers the total due; increase the amount if needed.</li>
      <li>Confirm the transfer and complete your funding password + 2FA verification.</li>
      <li>Wait 1–3 minutes, then find the transaction under <b>Assets → Withdrawal history</b> and copy the TXID (starts with 0x).</li>
      <li>Back on the FairDraw payment page, paste the TXID and tap Confirm — the campaign activates once verified.</li>
    </ol>
    <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      ⚠️ The network must be BNB Chain (BEP20). Choosing Ethereum, Polygon or any other network means the funds will never reach our address and cannot be recovered.
    </p>
  </>
);
// ────────────────────────────────────────────────────────

function FaqOKX() {
  const { t, lang } = useI18n();
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <Link to="/faq/payment" className="text-sm text-muted-foreground hover:text-foreground">{t("faq.pay.back")}</Link>
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
