import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { i18nLinks } from "@/lib/seo";

export const Route = createFileRoute("/faq/payment/okx")({
  head: () => ({
    meta: [
      { title: "欧易 OKX 支付教程 — FairDraw" },
      { name: "description", content: "从欧易 OKX 买 USDC 并提币到 FairDraw 收款地址：网络选 X Layer（手续费最低）或 Base / Polygon / Arbitrum，约 2 分钟完成支付。" },
      { property: "og:title", content: "欧易 OKX 支付教程 — FairDraw" },
      { property: "og:type", content: "article" },
    ],
    links: i18nLinks("/faq/payment/okx"),
  }),
  component: FaqOKX,
});

// ── 教程内容 ────────────────────────────────────────────
const CONTENT_ZH = (
  <>
    <p>在 OKX 买 <b>USDC</b> 直接提到 FairDraw 收款地址即可——不用装 MetaMask、不用换币，全程约 2 分钟。注意：OKX 的 USDT/USDC 提现<b>不支持 BNB Chain</b>，所以网络选 <b>X Layer</b>（OKX 自家链，手续费几乎为零）或 <b>Base / Polygon / Arbitrum</b>（约 $0.01–0.6），这几条链我们都接收。</p>
    <ol className="list-decimal space-y-3 pl-5">
      <li>先确认账户持有 <b>USDC</b> 且在<b>资金账户</b>里——链上转账只能从资金账户出。没有 USDC：点首页「充币 / Deposit」→ 在 Cash 栏选 <b>Euro</b> 用 SEPA 或银行卡充欧元 → 到账后在「Trade」买 USDC/EUR 或用「Convert」闪兑成 USDC（欧洲区只有 USDC 可买，USDT 已下架；Deposit 里 Crypto 栏是收币入口，不是买币）。USDC 若在交易账户，先到「资产 → 划转」划进资金账户，否则发起转账时会显示「暂无资产可发送」。</li>
      <li>打开欧易 App 的扫一扫，扫描 FairDraw 付款页的二维码，收款地址会自动填入（也可手动粘贴 0x 开头的地址）。</li>
      <li>收款账户类型选择<b>「交易所或平台」</b>。</li>
      <li>网络选 <b>X Layer</b>（手续费最低）或 <b>Base / Polygon / Arbitrum</b>——哪个便宜选哪个。⚠️ <b>不要选 BNB Chain / BSC</b>：OKX 对 USDT/USDC 不提供该网络；也别选 ERC20（Ethereum），手续费要好几美元。</li>
      <li>币种选 USDC 并输入金额：手续费从发送金额中扣除，页面显示预计到账——请确保到账 ≥ 应付总额，不足就调大发送金额。</li>
      <li>确认转账，完成资金密码和二次验证。</li>
      <li>等待到账（通常 1–3 分钟），然后到「资产 → 提币记录」找到该笔，复制 TXID（0x 开头的交易哈希）。</li>
      <li>回到 FairDraw 付款页，把 TXID 粘贴进输入框并点「确认支付」，系统核验后活动即开通。</li>
    </ol>
    <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      ⚠️ 网络只能选 <b>X Layer / Base / Polygon / Arbitrum</b>（或 BNB Chain——但 OKX 提不了）。选 ERC20、TRC20、Solana 等其他网络，资金不会到达平台地址且无法找回。
    </p>
  </>
);
const CONTENT_EN = (
  <>
    <p>Buy <b>USDC</b> on OKX and withdraw straight to the FairDraw deposit address — no MetaMask, no swapping, about 2 minutes. Note: OKX <b>cannot withdraw USDT/USDC on BNB Chain</b>, so pick <b>X Layer</b> (OKX's own chain, near-zero fee) or <b>Base / Polygon / Arbitrum</b> (~$0.01–0.6) — we accept them all.</p>
    <ol className="list-decimal space-y-3 pl-5">
      <li>Make sure you hold <b>USDC</b> in your <b>Funding account</b> — on-chain transfers can only send from it. No USDC yet: tap <b>Deposit</b> → choose <b>Euro</b> under Cash and top up via SEPA or card → once it arrives, buy USDC/EUR on Trade or use Convert (in the EEA, USDC is the only stablecoin available; the Crypto section inside Deposit is for receiving crypto you already own — not for buying). If USDC sits in your Trading account, move it via <b>Assets → Transfer</b> to Funding first, or the send screen shows "no assets available".</li>
      <li>Open the OKX app's scanner and scan the QR code on the FairDraw payment page — the deposit address fills in automatically (or paste the 0x address manually).</li>
      <li>For recipient account type, choose <b>Exchange or platform</b>.</li>
      <li>Select network <b>X Layer</b> (lowest fee) or <b>Base / Polygon / Arbitrum</b> — pick whichever is cheapest. ⚠️ <b>Do not pick BNB Chain/BSC</b> (OKX doesn't offer it for USDC anyway) and avoid ERC20 — it works technically but costs several dollars in fees.</li>
      <li>Pick USDC and enter the amount: the network fee is deducted from what you send — the page shows the estimated arrival amount. Make sure it covers the total due; increase the amount if needed.</li>
      <li>Confirm the transfer and complete your funding password + 2FA.</li>
      <li>Wait 1–3 minutes, then find the transaction under <b>Assets → Withdrawal history</b> and copy the TXID (starts with 0x).</li>
      <li>Back on the FairDraw payment page, paste the TXID and tap Confirm — the campaign activates once verified.</li>
    </ol>
    <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      ⚠️ The network must be <b>X Layer / Base / Polygon / Arbitrum</b> (or BNB Chain — which OKX doesn't offer). Choosing ERC20, TRC20, Solana or any other network means the funds will never reach our address and cannot be recovered.
    </p>
  </>
);
// ────────────────────────────────────────────────────────

export function FaqOKX() {
  const { t, lang, lp } = useI18n();
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <Link to={lp("/faq/payment") as never} className="text-sm text-muted-foreground hover:text-foreground">{t("faq.pay.back")}</Link>
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
