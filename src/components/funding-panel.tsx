import { useEffect, useMemo, useState } from "react";
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
import { parseUnits } from "viem";

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
 * Opens a custom-scheme app link on mobile and reports when nothing handled
 * it. Android builds an intent:// URL — with `pkg` Chrome falls back to the
 * Play Store automatically when the app is missing; iOS fires the raw scheme
 * and a ~2.5s visibility timeout decides the app isn't installed (the page
 * hides the moment an external app or dialog takes over).
 */
function openMobileApp(schemeUrl: string, opts: { pkg?: string; store?: string; onMissing?: () => void }) {
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!isAndroid && !isIOS) { window.location.href = schemeUrl; return; }
  let url = schemeUrl;
  if (isAndroid) {
    const m = schemeUrl.match(/^([a-z][a-z0-9+.-]*):(?:\/\/)?(.*)$/i);
    if (m) {
      url = `intent://${m[2]}#Intent;scheme=${m[1]};`
        + (opts.pkg ? `package=${opts.pkg};` : "")
        + (opts.store ? `S.browser_fallback_url=${encodeURIComponent(opts.store)};` : "")
        + "end";
    }
  }
  const timer = setTimeout(() => {
    document.removeEventListener("visibilitychange", onVis);
    if (!document.hidden) opts.onMissing?.();
  }, 2500);
  const onVis = () => {
    if (document.hidden) { clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); }
  };
  document.addEventListener("visibilitychange", onVis);
  window.location.href = url;
}

/**
 * One exchange withdrawal CTA. Web pages can't query installed apps, so the
 * click copies the address then tries to open the app via openMobileApp —
 * installed apps open, missing ones get a Play-Store redirect (Android) or an
 * inline "not detected" hint (iOS). Desktop browsers just copy.
 */
function ExchangeCopyBtn({ label, mark, bg, fg, depositTo, total, scheme, pkg, store }: {
  label: string; mark: string; bg: string; fg: string;
  depositTo: string; total: number;
  /** Custom URL scheme that opens the app on mobile, e.g. "bnc://app.binance.com". */
  scheme: string;
  /** Android package id — used to build an intent:// link. */
  pkg: string;
  /** Fallback URL when the app is missing — defaults to its Play Store page. */
  store?: string;
  /** Official download page linked from the iOS "app not detected" hint. */
  dl?: string;
}) {
  const { t } = useI18n();
  const cfg = chainConfig();
  const [copied, setCopied] = useState(false);
  const [missing, setMissing] = useState(false);

  function click() {
    navigator.clipboard?.writeText(depositTo).catch(() => {});
    setCopied(true);
    setMissing(false);
    setTimeout(() => setCopied(false), 3000);
    if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return; // desktop: copy only
    openMobileApp(scheme, {
      pkg,
      store: store ?? `https://play.google.com/store/apps/details?id=${pkg}`,
      onMissing: () => setMissing(true),
    });
  }

  return (
    <>
      <button type="button" onClick={click}
        style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:12,background:bg,color:fg,fontWeight:700,fontSize:14,border:0,cursor:"pointer",width:"100%"}}>
        <span style={{width:18,height:18,borderRadius:"50%",background:fg,color:bg,display:"grid",placeItems:"center",fontSize:mark.length>1?8:11,fontWeight:900,flexShrink:0}}>{mark}</span>
        {label} {t("m.binanceTag")}
        <span style={{marginLeft:"auto",fontSize:12,opacity:.85}}>{copied ? t("m.addrCopied") : `${total.toFixed(2)} ${cfg.tokenSymbol}`}</span>
      </button>
      {missing && (
        <p style={{fontSize:11,color:"var(--destructive)",textAlign:"center",margin:0}}>
          {t("m.appMissing")}
          {dl && <> · <a href={dl} target="_blank" rel="noreferrer" style={{color:"inherit",textDecoration:"underline"}}>{t("m.downloadApp")}</a></>}
        </p>
      )}
    </>
  );
}

/** Exchange withdrawal CTAs (Binance / OKX) sharing one hint line. */
function ExchangePayButtons({ depositTo, total }: { depositTo: string; total: number }) {
  const { t } = useI18n();
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {/* Binance's Play listing is region-restricted — fall back to the official download page instead. */}
      <ExchangeCopyBtn label="币安 Binance" mark="B" bg="#f0b90b" fg="#1e2026" depositTo={depositTo} total={total}
        scheme="bnc://app.binance.com" pkg="com.binance.dev" store="https://www.binance.com/en/download" dl="https://www.binance.com/en/download" />
      <ExchangeCopyBtn label="欧易 OKX" mark="OK" bg="#000" fg="#fff" depositTo={depositTo} total={total}
        scheme="okx://wallet" pkg="com.okinc.okex.gp" dl="https://www.okx.com/download" />
      <p style={{fontSize:11,color:"var(--muted-foreground)",textAlign:"center",margin:0}}>{t("m.binanceHint")}</p>
    </div>
  );
}

/**
 * Mobile wallets don't inject window.ethereum into external browsers. Instead of
 * reopening the page in the wallet's DApp browser (which loses the login session),
 * deep-link straight into the wallet's transfer screen with recipient/token/amount
 * pre-filled. After paying, the user returns here and pastes the tx hash.
 */
function MobileWalletPay({ depositTo, total, busy, txHash, setTxHash, hashError, setHashError, onConfirm }: {
  depositTo: string;
  total: number;
  busy: boolean;
  txHash: string; setTxHash: (v: string) => void;
  hashError: string; setHashError: (v: string) => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const cfg = chainConfig();
  const raw = parseUnits(total.toFixed(6), cfg.tokenDecimals).toString();
  // SLIP-44 coin ids used by Trust Wallet asset codes (c<id>_t<contract>).
  const trustAsset = ({ 56: "c20000714", 1: "c60", 97: "c20000714" } as Record<number, string>)[cfg.chainId];
  /** Holds the missing app's download URL ("" when it has none), null when nothing failed. */
  const [missing, setMissing] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  // MetaMask's https app.link resolves to the store itself; the rest are raw
  // schemes that need try-open detection + a Play-Store fallback.
  const wallets: { name: string; bg: string; fg: string; href?: string; scheme?: string; pkg?: string; dl?: string }[] = [
    { name: "MetaMask", bg: "#e88100", fg: "#fff",
      href: `https://metamask.app.link/send/${cfg.tokenAddress}@${cfg.chainId}/transfer?address=${depositTo}&uint256=${raw}` },
    ...(trustAsset ? [{ name: "Trust Wallet", bg: "#3375bb", fg: "#fff",
      scheme: `trust://send?asset=${trustAsset}_t${cfg.tokenAddress}&address=${depositTo}&amount=${total.toFixed(6)}`,
      pkg: "com.wallet.crypto.trustapp", dl: "https://trustwallet.com/download" }] : []),
    { name: "TokenPocket", bg: "#2980fe", fg: "#fff",
      scheme: `tpdapp://transfer?chain=BSC&contract=${cfg.tokenAddress}&to=${depositTo}&amount=${total.toFixed(6)}`,
      pkg: "vip.mytokenpocket", dl: "https://www.tokenpocket.pro" },
    { name: t("m.otherWallet"), bg: "#334", fg: "#fff",
      scheme: `ethereum:${cfg.tokenAddress}@${cfg.chainId}/transfer?address=${depositTo}&uint256=${raw}` },
  ];
  const rowStyle = {display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:12,fontWeight:600,fontSize:14} as const;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {/MicroMessenger|QQ\//i.test(navigator.userAgent) && (
        <p style={{fontSize:12,color:"var(--destructive)",textAlign:"center",margin:0}}>{t("m.wechatHint")}</p>
      )}
      <p style={{fontSize:12,color:"var(--muted-foreground)",marginBottom:2,textAlign:"center"}}>{t("m.mobileWalletHint")}</p>
      <ExchangePayButtons depositTo={depositTo} total={total} />
      {wallets.map((w) => w.href ? (
        <a key={w.name} href={w.href} style={{...rowStyle,background:w.bg,color:w.fg,textDecoration:"none"}}>
          <Wallet style={{width:18,height:18,flexShrink:0}} />{t("m.openIn")} {w.name}
          <span style={{marginLeft:"auto",fontSize:12,opacity:.85}}>{total.toFixed(2)} {cfg.tokenSymbol}</span>
        </a>
      ) : (
        <button key={w.name} type="button" style={{...rowStyle,background:w.bg,color:w.fg,border:0,cursor:"pointer"}}
          onClick={() => {
            setMissing(null); setOpening(w.name);
            setTimeout(() => setOpening((o) => (o === w.name ? null : o)), 3000);
            openMobileApp(w.scheme!, {
              pkg: w.pkg,
              store: w.pkg ? `https://play.google.com/store/apps/details?id=${w.pkg}` : undefined,
              onMissing: () => setMissing(w.dl ?? ""),
            });
          }}>
          <Wallet style={{width:18,height:18,flexShrink:0}} />{t("m.openIn")} {w.name}
          <span style={{marginLeft:"auto",fontSize:12,opacity:.85}}>{opening === w.name ? t("m.openingApp") : `${total.toFixed(2)} ${cfg.tokenSymbol}`}</span>
        </button>
      ))}
      {missing !== null && (
        <p style={{fontSize:11,color:"var(--destructive)",textAlign:"center",margin:0}}>
          {t("m.appMissing")}
          {missing && <> · <a href={missing} target="_blank" rel="noreferrer" style={{color:"inherit",textDecoration:"underline"}}>{t("m.downloadApp")}</a></>}
        </p>
      )}
      <p style={{fontSize:11,color:"var(--muted-foreground)",textAlign:"center",margin:"6px 0 2px"}}>{t("m.mobileWalletOr")}</p>
      <div className="hash-row">
        <input className="hash-in" placeholder="0x…" value={txHash} spellCheck={false}
          onChange={(e) => { setTxHash(e.target.value); setHashError(""); }} />
        <button type="button" className="hash-btn" disabled={busy} onClick={onConfirm}>{t("m.confirmTx")}</button>
      </div>
      {hashError && <p style={{fontSize:12,color:"var(--destructive)",marginTop:2}}>{hashError}</p>}
    </div>
  );
}

/**
 * Chain payment body: wallet-connect or manual transfer sub-tabs.
 * `getCampaign` resolves the campaign row on demand — the /new ticket passes a
 * function that creates/updates the row first; manage page passes the row itself.
 */
export function ChainFundingBody({ getCampaign, total, busy, setBusy, onDone }: {
  getCampaign: () => Promise<FundingCampaign | null>;
  total: number;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { data: fees = [] } = useFeeTiers();
  const confirmChain = useServerFn(confirmChainPayment);
  const [tab, setTab] = useState<"wallet" | "transfer">("wallet");
  const [txHash, setTxHash] = useState("");
  const [hashError, setHashError] = useState("");
  const [payStep, setPayStep] = useState<"idle" | "wallet" | "chain">("idle");
  const isMobile = useMemo(() => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent), []);
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

  async function payChain() {
    if (!hasEthereum()) {
      if (!isMobile) { toast.error(t("m.noMetaMask")); setTab("transfer"); }
      // On mobile: UI already shows deep-link panel; nothing more to do.
      return;
    }
    if (!cfg.escrowAddress && !cfg.receiverAddress && !cfg.treasuryAddress) { toast.error(t("m.noReceiver")); return; }
    setBusy(true);
    setPayStep("wallet");
    try {
      const c = await getCampaign();
      if (!c) return;
      const pool = c.prize_amount ?? 0;
      const fee = feeAmount(fees, pool);
      const hash = cfg.escrowAddress
        ? await fundEscrow(c.id, pool, fee, Math.max(Math.floor(Date.now() / 1000), Math.floor(Date.parse(c.ends_at ?? "") / 1000) || 0))
        : await sendTokenTransfer(cfg.receiverAddress!, pool + fee);
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

  const chainBtnText =
    payStep === "wallet" ? t("m.fundWaitingWallet")
    : payStep === "chain" ? t("m.fundWaitingChain")
    : `${t("m.fundChainPay")} ${total.toFixed(2)} ${cfg.tokenSymbol}`;

  return (
    <>
      <div className="seg-sub" role="tablist" style={{marginTop:12}}>
        {(["wallet","transfer"] as const).map((tb) => (
          <button key={tb} role="tab" type="button"
            aria-selected={tab === tb}
            onClick={() => setTab(tb)}>
            {tb === "wallet" ? t("m.fundTabWallet") : t("m.fundTabTransfer")}
          </button>
        ))}
      </div>

      {tab === "wallet" && (
        <div style={{marginTop:"14px"}}>
          {isMobile && !hasEthereum() ? (
            depositTo ? (
              <MobileWalletPay depositTo={depositTo} total={total} busy={busy}
                txHash={txHash} setTxHash={setTxHash} hashError={hashError} setHashError={setHashError}
                onConfirm={confirmManual} />
            ) : (
              <button className="btn-gradient" disabled={busy} onClick={payChain} type="button">
                <Wallet style={{width:20,height:20}} />{chainBtnText}
              </button>
            )
          ) : (
            <>
              <button className="btn-gradient" disabled={busy} onClick={payChain} type="button">
                <Wallet style={{width:20,height:20}} />{chainBtnText}
              </button>
              <div className="wallets-list">
                <span>MetaMask</span><span>OKX Wallet</span><span>Binance Wallet</span><span>TokenPocket</span>
              </div>
              {depositTo && (
                <div style={{marginTop:12}}>
                  <ExchangePayButtons depositTo={depositTo} total={total} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "transfer" && (
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
          <p style={{fontSize:11,color:"var(--muted-foreground)",textAlign:"center",margin:"8px 0 0"}}>{t("m.binanceQrHint")}</p>
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
      )}
    </>
  );
}

