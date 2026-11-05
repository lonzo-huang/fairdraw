import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, Wallet } from "lucide-react";
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
  const [txHash, setTxHash] = useState("");
  const [payStep, setPayStep] = useState<"idle" | "wallet" | "chain">("idle");
  const [showManual, setShowManual] = useState(false);
  const [copied, setCopied] = useState(false);
  const cfg = chainConfig();
  const { data: paycfg } = useQuery({ queryKey: ["paycfg"], queryFn: () => getPaymentConfig() });
  const depositTo = paycfg?.chain.treasuryAddress ?? cfg.treasuryAddress ?? cfg.receiverAddress;
  const pool = c.prize_amount ?? 0;
  const fee = feeAmount(fees, pool);
  const total = pool + fee;

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
    if (!hasEthereum()) { toast.error(t("m.noMetaMask")); setShowManual(true); return; }
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
    setBusy(true);
    try {
      await confirmChain({ data: { campaignId: c.id, txHash: txHash.trim() } });
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
      <h2 className="text-xl font-semibold">{t("m.funding")}</h2>

      {/* Layer 1 — amount due */}
      <div className="mt-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {cfg.tokenSymbol} · {c.payment_method === "chain" ? cfg.chainName : t("m.fundDue")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{t("m.fundDue")}</p>
        <p className="mt-1 font-mono text-3xl font-bold">
          {total.toFixed(2)} <span className="text-base font-semibold text-muted-foreground">{c.currency ?? cfg.tokenSymbol}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("m.fundPool")} {pool.toFixed(2)} + {t("m.fundFee")} {fee.toFixed(2)} {c.currency ?? cfg.tokenSymbol}
        </p>
      </div>

      {/* Layer 2 — primary action */}
      <div className="mt-4">
        {c.payment_method === "stripe" && (
          <Button className="w-full sm:w-auto" disabled={busy} onClick={payStripe}>
            {t("m.fundStripe")} {total.toFixed(2)} {c.currency}
          </Button>
        )}
        {c.payment_method === "chain" && (
          <>
            <Button className="w-full sm:w-auto" size="lg" disabled={busy} onClick={payChain}>
              <Wallet className="mr-2 h-4 w-4" />{chainBtnText}
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">{t("m.fundVerify")}</p>
          </>
        )}
        {c.payment_method === "manual" && <p className="text-sm text-muted-foreground">{t("m.manualFund")}</p>}
      </div>

      {/* Layer 3 — walletless manual transfer (collapsed by default) */}
      {c.payment_method === "chain" && (
        <div className="mt-5 rounded-lg border border-border/60">
          <button
            type="button"
            onClick={() => setShowManual((s) => !s)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showManual ? "" : "-rotate-90"}`} />
            <span className="font-medium">{t("m.fundOther")}</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">{t("m.fundOtherHint")}</span>
          </button>
          {showManual && (
            <div className="space-y-3 border-t border-border/60 px-4 py-3">
              <div>
                <p className="text-xs text-muted-foreground">{t("m.fundAddr")} · {cfg.chainName}</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="break-all font-mono text-xs">{depositTo}</code>
                  <Button type="button" size="sm" variant="outline" onClick={copyAddr}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span className="ml-1">{copied ? t("m.copied") : t("m.copyAddr")}</span>
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("m.fundOnlyNet")} {cfg.chainName} · {t("m.fundSendAmt")} {total.toFixed(2)} {cfg.tokenSymbol}
                </p>
              </div>
              <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                <p>{t("m.fundStep1")}</p>
                <p>{t("m.fundStep2")}</p>
                <p>{t("m.fundStep3")}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input placeholder={t("m.txHash")} value={txHash} onChange={(e) => setTxHash(e.target.value)} />
                <Button size="sm" variant="secondary" disabled={busy || !txHash.trim()} onClick={confirmManual}>{t("m.confirmTx")}</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
