import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/lib/i18n";
import { confirmChainPayment, startStripeCheckout } from "@/lib/payment.functions";
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
  const cfg = chainConfig();
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
    if (!hasEthereum()) { toast.error(t("m.noMetaMask")); return; }
    if (!cfg.escrowAddress && !cfg.receiverAddress) { toast.error(t("m.noReceiver")); return; }
    setBusy(true);
    try {
      const hash = cfg.escrowAddress
        ? await fundEscrow(c.id, pool, fee, Math.max(Math.floor(Date.now() / 1000), Math.floor(Date.parse(c.ends_at ?? "") / 1000) || 0))
        : await sendTokenTransfer(cfg.receiverAddress!, total);
      await confirmChain({ data: { campaignId: c.id, txHash: hash } });
      toast.success(t("pay.funded"));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
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

  return (
    <section className="rounded-xl border border-primary/40 bg-primary/5 p-5">
      <h2 className="text-xl font-semibold">{t("m.funding")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("m.fundNeed")}: <span className="font-mono font-semibold text-foreground">{total.toFixed(2)} {c.currency}</span>
        {c.payment_method === "chain" && (cfg.escrowAddress ?? cfg.receiverAddress) && (
          <span className="mt-1 block break-all font-mono text-xs">→ {cfg.escrowAddress ?? cfg.receiverAddress}</span>
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {c.payment_method === "stripe" && <Button size="sm" disabled={busy} onClick={payStripe}>{t("m.fundStripe")}</Button>}
        {c.payment_method === "chain" && <Button size="sm" disabled={busy} onClick={payChain}>{t("m.fundChain")}</Button>}
        {c.payment_method === "manual" && <p className="text-sm text-muted-foreground">{t("m.manualFund")}</p>}
      </div>
      {c.payment_method === "chain" && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input placeholder={t("m.txHash")} value={txHash} onChange={(e) => setTxHash(e.target.value)} />
          <Button size="sm" variant="secondary" disabled={busy || !txHash.trim()} onClick={confirmManual}>{t("m.confirmTx")}</Button>
        </div>
      )}
    </section>
  );
}
