import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/faq/payment/okx")({
  head: () => ({
    meta: [
      { title: "欧易 OKX 支付教程 — FairDraw" },
      { name: "description", content: "OKX 不支持 USDT/USDC 提到 BNB Chain：从欧易 OKX 经 BNB 或跨链桥把 USDT/USDC 转到 FairDraw 收款地址的完整步骤。" },
      { property: "og:title", content: "欧易 OKX 支付教程 — FairDraw" },
      { property: "og:type", content: "article" },
    ],
  }),
  component: FaqOKX,
});

// ── 教程内容 ────────────────────────────────────────────
const CONTENT_ZH = (
  <>
    <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      ⚠️ 先说结论：<b>OKX 不支持把 USDT / USDC 提到 BNB Chain（BEP20）</b>——提现网络列表里没有 BSC（欧洲区用户还买不到 USDT，只有 USDC）。所以付款需要绕一步，下面三种方式任选其一。
    </p>

    <h2 className="pt-2 text-lg font-semibold text-foreground">方式一（推荐）：BNB 中转</h2>
    <p>OKX 支持把 <b>BNB</b> 提到 BNB Chain，而且 BNB 本身就是这条链的手续费代币，到账后还能留一点当 gas。</p>
    <ol className="list-decimal space-y-3 pl-5">
      <li>在 OKX 用欧元买 <b>BNB</b>（金额比应付总额多一点，预留兑换损耗和手续费）。</li>
      <li>提币：币种选 BNB → 收款地址填你自己的链上钱包（如 MetaMask 的 0x 地址）→ 网络选 <b>BNB Smart Chain / BSC</b>。</li>
      <li>BNB 到账后，在钱包里（MetaMask 内置兑换或 PancakeSwap）把 BNB 换成 <b>USDT</b>——记得留约 0.001–0.005 BNB 作为后续转账的 gas。</li>
      <li>把 USDT 转到 FairDraw 付款页的收款地址，在转账记录里复制交易哈希（0x 开头）。</li>
      <li>回到付款页粘贴哈希并点「确认支付」，核验通过即完成。</li>
    </ol>

    <h2 className="pt-2 text-lg font-semibold text-foreground">方式二：USDC + 跨链桥</h2>
    <ol className="list-decimal space-y-3 pl-5">
      <li>在 OKX 买 <b>USDC</b>（欧洲区只有 USDC 可买）。</li>
      <li>提币时网络选手续费低的链，如 <b>Base / Arbitrum / Polygon</b>（约 $0.01–0.6），提到你的链上钱包。</li>
      <li>用跨链桥把 USDC 转到 BNB Chain：MetaMask 内置 Bridge、Stargate、deBridge 均可（约 1–10 分钟，有少量桥费）。USDC 到 BSC 后就是 USDC-BEP20，我们同样接收；也可以在 BSC 上换成 USDT 再转。</li>
      <li>注意：在 BSC 上发起转账需要少量 BNB 作 gas——桥接时顺便买/换一点 BNB。</li>
      <li>把 USDC（或 USDT）转到付款页收款地址，复制 BSC 上的交易哈希回来确认。</li>
    </ol>

    <h2 className="pt-2 text-lg font-semibold text-foreground">方式三：OKX Web3 钱包跨链闪兑</h2>
    <ol className="list-decimal space-y-3 pl-5">
      <li>OKX App 内置 Web3 钱包：把 USDC 从交易所划到 Web3 钱包（任意支持的网络，如 Solana / Base）。</li>
      <li>用 OKX DEX 的跨链兑换，直接把 USDC 换成 <b>BNB Chain 上的 USDT 或 USDC</b>。</li>
      <li>从 Web3 钱包把币转到付款页收款地址（留点 BNB 作 gas），复制交易哈希回来确认。</li>
    </ol>

    <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      ⚠️ 无论走哪条路，最终到达收款地址的必须是 <b>BNB Chain 上的 USDT 或 USDC</b>。其他链（ERC20、TRC20、Solana…）上的转账系统验证不到，也无法找回。
    </p>
  </>
);
const CONTENT_EN = (
  <>
    <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      ⚠️ Heads up: <b>OKX cannot withdraw USDT / USDC to BNB Chain (BEP20)</b> — BSC is simply absent from its network list (and in the EEA, USDT isn't even available to buy — only USDC). Payment therefore takes one extra hop; pick whichever route below suits you.
    </p>

    <h2 className="pt-2 text-lg font-semibold text-foreground">Option 1 (recommended): via BNB</h2>
    <p>OKX does support <b>BNB</b> withdrawals on BNB Smart Chain — and BNB doubles as the chain's gas token, so keep a little for fees.</p>
    <ol className="list-decimal space-y-3 pl-5">
      <li>Buy <b>BNB</b> on OKX with EUR (slightly more than the amount due, to cover swap slippage and fees).</li>
      <li>Withdraw: choose BNB → paste your own wallet address (e.g. MetaMask 0x…) → select network <b>BNB Smart Chain / BSC</b>.</li>
      <li>Once BNB arrives, swap it to <b>USDT</b> in your wallet (MetaMask's built-in swap or PancakeSwap) — keep ~0.001–0.005 BNB for gas.</li>
      <li>Send the USDT to the deposit address on the FairDraw payment page, then copy the transaction hash (starts with 0x).</li>
      <li>Paste the hash back on the payment page and press Confirm — done once verified.</li>
    </ol>

    <h2 className="pt-2 text-lg font-semibold text-foreground">Option 2: USDC + a cross-chain bridge</h2>
    <ol className="list-decimal space-y-3 pl-5">
      <li>Buy <b>USDC</b> on OKX (in the EEA it's the only stablecoin you can buy).</li>
      <li>Withdraw on a cheap network — <b>Base / Arbitrum / Polygon</b> (~$0.01–0.6 fee) — to your own wallet.</li>
      <li>Bridge USDC to BNB Chain via MetaMask Bridge, Stargate or deBridge (~1–10 min, small bridge fee). USDC arriving on BSC is USDC-BEP20, which we accept — or swap it to USDT on BSC first.</li>
      <li>Note: sending on BSC needs a little BNB for gas — pick some up while bridging.</li>
      <li>Send USDC (or USDT) to the deposit address, then paste the BSC transaction hash back to confirm.</li>
    </ol>

    <h2 className="pt-2 text-lg font-semibold text-foreground">Option 3: OKX Web3 wallet cross-chain swap</h2>
    <ol className="list-decimal space-y-3 pl-5">
      <li>OKX's built-in Web3 wallet: move USDC from your exchange account into it (any supported network, e.g. Solana / Base).</li>
      <li>Use OKX DEX's cross-chain swap to convert USDC directly into <b>USDT or USDC on BNB Chain</b>.</li>
      <li>Send the tokens from the Web3 wallet to the deposit address (keep some BNB for gas), then paste the tx hash back to confirm.</li>
    </ol>

    <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      ⚠️ Whichever route you take, what lands at the deposit address must be <b>USDT or USDC on BNB Chain</b>. Transfers on other chains (ERC20, TRC20, Solana…) cannot be verified and cannot be recovered.
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
