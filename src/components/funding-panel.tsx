import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Wallet } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { confirmChainPayment, getPaymentConfig, startStripeCheckout } from "@/lib/payment.functions";
import { chainConfig } from "@/lib/payments";
import { feeAmount } from "@/lib/fees";
import { useFeeTiers } from "@/hooks/use-fee-tiers";
import { fundEscrow, hasEthereum, sendTokenTransfer } from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FundingCampaign = { id: string; prize_amount?: number | null; currency?: string | null; payment_method: string; ends_at?: string | null };

/** Pool + platform-fee prepayment: Stripe Checkout redirect or inline MetaMask transfer. */
export function FundingPanel({ c, busy, setBusy, onDone }: { c: FundingCampaign; busy: boolean; setBusy: (b: boolean) => void; onDone: () => void }) {
  const { t } = useI18n();
  const { data: fees = [] } = useFeeTiers();
  const checkout = useServerFn(startStripeCheckout);
  const confirmChain = useServerFn(confirmChainPayment);
  const [tab, setTab] = useState<"wallet" | "transfer">("wallet");
  const [txHash, setTxHash] = useState("");
  const [hashError, setHashError] = useState("");
  const [payStep, setPayStep] = useState<"idle" | "wallet" | "chain">("idle");
  const [copied, setCopied] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const cfg = chainConfig();
  const { data: paycfg } = useQuery({ queryKey: ["paycfg"], queryFn: () => getPaymentConfig() });
  const depositTo = paycfg?.chain.treasuryAddress ?? cfg.treasuryAddress ?? cfg.receiverAddress;
  const pool = c.prize_amount ?? 0;
  const fee = feeAmount(fees, pool);
  const total = pool + fee;

  useEffect(() => {
    if (!depositTo || c.payment_method !== "chain") return;
    import("qrcode").then(({ default: QRCode }) => {
      QRCode.toDataURL(depositTo, { width: 112, margin: 1 }).then(setQrUrl).catch(() => {});
    }).catch(() => {});
  }, [depositTo, c.payment_method]);

  const formattedAddr = depositTo ? depositTo.replace(/(.{4})(?=.)/g, "$1 ") : "";

  async function payStripe() {
    setBusy(true);
    try {
      const r = await checkout({ data: { campaignId: c.id, origin: window.location.origin } });
      if (r.url) window.location.href = r.url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }
  async function payChain() {
    if (!hasEthereum()) { toast.error(t("m.noMetaMask")); setTab("transfer"); return; }
    if (!cfg.escrowAddress && !cfg.receiverAddress && !cfg.treasuryAddress) { toast.error(t("m.noReceiver")); return; }
    setBusy(true);
    setPayStep("wallet");
    try {
      const hash = cfg.escrowAddress
        ? await fundEscrow(c.id, pool, fee, Math.max(Math.floor(Date.now() / 1000), Math.floor(Date.parse(c.ends_at ?? "") / 1000) || 0))
        : await sendTokenTransfer(cfg.receiverAddress!, total);
      setPayStep("chain");
      await confirmChain({ data: { campaignId: c.id, txHash: hash } });
      toast.success(t("pay.funded"));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setPayStep("idle");
    }
  }
  async function copyAddr() {
    if (!depositTo) return;
    await navigator.clipboard.writeText(depositTo).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  async function confirmManual() {
    const h = txHash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(h)) { setHashError(t("m.fundHashFmt")); return; }
    setHashError("");
    setBusy(true);
    try {
      await confirmChain({ data: { campaignId: c.id, txHash: h } });
      toast.success(t("pay.funded"));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const chainBtnText =
    payStep === "wallet" ? t("m.fundWaitingWallet")
    : payStep === "chain" ? t("m.fundWaitingChain")
    : `${t("m.fundChainPay")} ${total.toFixed(2)} ${cfg.tokenSymbol}`;

  return (
    <section className="rounded-xl border border-primary/40 bg-primary/5 p-5">
      {/* Amount header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{t("m.fundDue")}</p>
          <p className="mt-0.5 font-mono text-3xl font-bold tabular-nums"
             style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {total.toFixed(2)} <span className="text-lg">{cfg.tokenSymbol}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("m.fundPool")} {pool.toFixed(2)} + {t("m.fundFee")} {fee.toFixed(2)} {cfg.tokenSymbol}
            {" · "}<span className="text-emerald-400">↺ {t("m.fundRefund")}</span>
          </p>
        </div>
        {c.payment_method === "chain" && (
          <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400">
            ● {cfg.chainName}
          </span>
        )}
      </div>

      {c.payment_method === "chain" && (
        <>
          {/* Segmented tab */}
          <div className="mt-4 flex gap-0.5 rounded-lg border border-border bg-background/50 p-0.5">
            {(["wallet", "transfer"] as const).map((tb) => (
              <button key={tb} type="button" onClick={() => setTab(tb)}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  tab === tb ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                {tb === "wallet" ? t("m.fundTabWallet") : t("m.fundTabTransfer")}
              </button>
            ))}
          </div>

          {tab === "wallet" && (
            <div className="mt-4 space-y-2">
              <Button className="w-full" size="lg" disabled={busy} onClick={payChain}>
                <Wallet className="mr-2 h-4 w-4 shrink-0" />{chainBtnText}
              </Button>
              <p className="text-xs text-muted-foreground">{t("m.fundVerify")}</p>
            </div>
          )}

          {tab === "transfer" && (
            <div className="mt-4 space-y-3">
              <div className="flex gap-3 rounded-xl border border-border bg-background/60 p-3">
                {qrUrl ? (
                  <img src={qrUrl} alt="QR" className="h-20 w-20 shrink-0 rounded-lg border border-border" />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-xs text-muted-foreground">QR</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{t("m.fundAddr")}</p>
                  <p className="mt-1 break-all font-mono text-[11px] leading-relaxed tracking-wide">{formattedAddr}</p>
                  <Button type="button" size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={copyAddr}>
                    {copied
                      ? <><Check className="mr-1 h-3 w-3" />{t("m.copied")}</>
                      : <><Copy className="mr-1 h-3 w-3" />{t("m.copyAddr")}</>}
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-400">
                <span>⚠</span>
                <span>{t("m.fundWarnNet")}</span>
              </div>
              <div className="space-y-3 py-1">
                {[
                  { n: 1, title: `${t("m.fundStep1T")} ${total.toFixed(2)} ${cfg.tokenSymbol} ${t("m.fundStep1T2")}`, sub: t("m.fundStep1Sub") },
                  { n: 2, title: t("m.fundStep2T"), sub: t("m.fundStep2Sub") },
                ].map(({ n, title, sub }) => (
                  <div key={n} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{n}</span>
                    <div>
                      <p className="text-sm font-semibold">{title}</p>
                      <p className="text-xs text-muted-foreground">{sub}</p>
                    </div>
                  </div>
                ))}
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">3</span>
                  <div className="flex-1 space-y-1.5">
                    <p className="text-sm font-semibold">{t("m.fundStep3T")}</p>
                    <div className="flex gap-2">
                      <Input placeholder="0x…" value={txHash}
                        onChange={(e) => { setTxHash(e.target.value); setHashError(""); }}
                        className={hashError ? "border-destructive" : ""} />
                      <Button size="sm" disabled={busy} onClick={confirmManual}>{t("m.confirmTx")}</Button>
                    </div>
                    {hashError && <p className="text-xs text-destructive">{hashError}</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {c.payment_method === "stripe" && (
        <Button className="mt-4 w-full" disabled={busy} onClick={payStripe}>
          {t("m.fundStripe")} {total.toFixed(2)} {c.currency}
        </Button>
      )}
      {c.payment_method === "manual" && (
        <p className="mt-4 text-sm text-muted-foreground">{t("m.manualFund")}</p>
      )}
    </section>
  );
}
