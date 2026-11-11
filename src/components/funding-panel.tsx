import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { confirmChainPayment, getPaymentConfig, startStripeCheckout } from "@/lib/payment.functions";
import { chainConfig } from "@/lib/payments";
import { feeAmount } from "@/lib/fees";
import { useFeeTiers } from "@/hooks/use-fee-tiers";

export type FundingCampaign = { id: string; prize_amount?: number | null; currency?: string | null; payment_method: string; ends_at?: string | null };

/** Pool + platform-fee prepayment: Stripe Checkout redirect or inline MetaMask transfer. */
export function FundingPanel({ c, busy, setBusy, onDone }: { c: FundingCampaign; busy: boolean; setBusy: (b: boolean) => void; onDone: () => void }) {
  const { t } = useI18n();
  const { data: fees = [] } = useFeeTiers();
  const checkout = useServerFn(startStripeCheckout);
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

  const chainBody = (
    <ChainFundingBody getCampaign={() => Promise.resolve(c)} total={total} busy={busy} setBusy={setBusy} onDone={onDone} />
  );

  return (
    <div className="ticket-wrap">
      <div className="ticket-inner">
        {/* ── top: amount ── */}
        <div className="t-top">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <h3 style={{fontSize:"16px",fontWeight:700}}>{t("m.funding")}</h3>
            {c.payment_method === "chain" && <span className="chain-badge">{cfg.chainName}</span>}
          </div>
          <p className="text-xs text-muted-foreground" style={{marginTop:"18px"}}>{t("m.fundDue")}</p>
          <div className="t-amt">
            <span className="t-amt-big">{total.toFixed(2)}</span>
            <span className="t-amt-cur">{cfg.tokenSymbol}</span>
          </div>
          <div className="t-break">
            <span>{t("m.fundPool")} <b>{pool.toFixed(2)}</b></span>
            <span>{t("m.fundFee")} <b>{fee.toFixed(2)}</b> {cfg.tokenSymbol}</span>
          </div>
        </div>

        {/* ── perforation ── */}
        <div className="perf-notch" aria-hidden="true" />

        {/* ── bottom: payment ── */}
        <div className="t-bot">
          {c.payment_method === "stripe" && (
            <>
              <button className="btn-gradient" disabled={busy} onClick={payStripe} type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                {t("m.fundStripe")} {total.toFixed(2)} {c.currency}
              </button>
            </>
          )}

          {c.payment_method === "chain" && chainBody}

          {c.payment_method === "manual" && (
            <p className="text-sm text-muted-foreground">{t("m.manualFund")}</p>
          )}
        </div>

        {/* ── trust ── */}
        <div className="trust-line">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>
          {t("m.fundTrust")}
        </div>
      </div>
    </div>
  );
}

/**
 * Chain payment body: transfer-only.
 * User copies the address, sends USDT from any app/exchange, then pastes the txHash.
 */
export function ChainFundingBody({ getCampaign, total, busy, setBusy, onDone }: {
  getCampaign: () => Promise<FundingCampaign | null>;
  total: number;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const confirmChain = useServerFn(confirmChainPayment);
  const [txHash, setTxHash] = useState("");
  const [hashError, setHashError] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const cfg = chainConfig();
  const { data: paycfg } = useQuery({ queryKey: ["paycfg"], queryFn: () => getPaymentConfig() });
  const depositTo = paycfg?.chain.treasuryAddress ?? cfg.treasuryAddress ?? cfg.receiverAddress;

  useEffect(() => {
    if (!depositTo) return;
    import("qrcode").then(({ default: QRCode }) => {
      QRCode.toDataURL(depositTo, { width: 112, margin: 1 }).then(setQrUrl).catch(() => {});
    }).catch(() => {});
  }, [depositTo]);

  const formattedAddr = depositTo ? depositTo.replace(/(.{4})(?=.)/g, "$1 ") : "";

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
      const c = await getCampaign();
      if (!c) return;
      await confirmChain({ data: { campaignId: c.id, txHash: h } });
      toast.success(t("pay.funded"));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{marginTop:"14px"}}>
      <div className="addr-box">
        {qrUrl
          ? <img src={qrUrl} alt="QR" style={{width:92,height:92,flexShrink:0,borderRadius:10,border:"1px solid rgba(255,255,255,.07)"}} />
          : <div style={{width:92,height:92,flexShrink:0,borderRadius:10,background:"rgba(255,255,255,.04)",display:"grid",placeItems:"center",fontSize:11,color:"var(--muted-foreground)"}}>QR</div>
        }
        <div style={{minWidth:0,flex:1,display:"flex",flexDirection:"column"}}>
          <span style={{fontSize:12,color:"var(--muted-foreground)"}}>{t("m.fundAddr")}</span>
          <div className="addr-mono">{formattedAddr}</div>
          <button type="button" className={`ghost-btn${copied?" done":""}`} onClick={copyAddr}>
            {copied ? <Check style={{width:15,height:15}}/> : <Copy style={{width:15,height:15}}/>}
            {copied ? t("m.copied") : t("m.copyAddr")}
          </button>
        </div>
      </div>
      <div className="bep20-warn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>
        {t("m.fundWarnNet")}
      </div>
      <p style={{fontSize:11,color:"var(--muted-foreground)",textAlign:"center",margin:"8px 0 0"}}>
        <a href="/faq/payment" style={{color:"var(--primary)",textDecoration:"underline"}}>{t("faq.pay.seeGuide")}</a>
      </p>
      <ol className="steps-list">
        <li>
          <span className="steps-n">1</span>
          <div><div style={{fontSize:14,fontWeight:500}}>{t("m.fundStep1T")} {total.toFixed(2)} {cfg.tokenSymbol} {t("m.fundStep1T2")}</div><div style={{fontSize:12,color:"var(--muted-foreground)"}}>{t("m.fundStep1Sub")}</div></div>
        </li>
        <li>
          <span className="steps-n">2</span>
          <div><div style={{fontSize:14,fontWeight:500}}>{t("m.fundStep2T")}</div><div style={{fontSize:12,color:"var(--muted-foreground)"}}>{t("m.fundStep2Sub")}</div></div>
        </li>
        <li>
          <span className="steps-n">3</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:500}}>{t("m.fundStep3T")}</div>
            <div className="hash-row">
              <input className="hash-in" placeholder="0x…" value={txHash} spellCheck={false}
                onChange={(e) => { setTxHash(e.target.value); setHashError(""); }} />
              <button type="button" className="hash-btn" disabled={busy} onClick={confirmManual}>{t("m.confirmTx")}</button>
            </div>
            {hashError && <p style={{fontSize:12,color:"var(--destructive)",marginTop:6}}>{hashError}</p>}
          </div>
        </li>
      </ol>
    </div>
  );
}

