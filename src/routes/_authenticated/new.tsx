import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { type Conditions } from "@/lib/conditions";
import { campaignTweet, prizeSummary, type ShareCampaign } from "@/lib/campaign-share";
import { renderShareImage } from "@/lib/campaign-share-image";
import { BadgeCheck, BarChart3, Bookmark, CheckCircle2, Download, Eye, Heart, MessageCircle, MessageSquare, Repeat2, Share, Users } from "lucide-react";
import { CURRENCIES, DURATIONS, endsAtFromDays } from "@/lib/plans";
import { chainConfig, stripeSupports } from "@/lib/payments";
import { feeAmount } from "@/lib/fees";
import { useFeeTiers } from "@/hooks/use-fee-tiers";
import { startStripeCheckout } from "@/lib/payment.functions";
import { ChainFundingBody, type FundingCampaign } from "@/components/funding-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/new")({
  head: () => ({ meta: [
    { title: "New campaign — FairDraw" },
    { name: "description", content: "Create a verifiable FairDraw community giveaway." },
    { property: "og:title", content: "New campaign — FairDraw" },
    { property: "og:description", content: "Create a verifiable FairDraw community giveaway." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: NewCampaign,
});

type Created = ShareCampaign & { id: string; ends_at: string; payment_method: string };

/** Selectable metric conditions: checkbox + ≥ threshold input, max 3 picked. */
const METRIC_KEYS = ["min_likes", "min_replies", "min_reposts", "min_quotes", "min_views", "min_participants", "min_verified"] as const;
type MetricKey = (typeof METRIC_KEYS)[number];
const METRIC_LABEL: Record<MetricKey, "cond.likes" | "cond.replies" | "cond.reposts" | "cond.quotes" | "cond.views" | "cond.participants" | "cond.verified"> = {
  min_likes: "cond.likes", min_replies: "cond.replies", min_reposts: "cond.reposts",
  min_quotes: "cond.quotes", min_views: "cond.views",
  min_participants: "cond.participants", min_verified: "cond.verified",
};
const MAX_CONDITIONS = 4;
const PRESET_AMOUNTS = [10, 50, 100, 500, 1000];
const METRIC_ICON: Record<MetricKey, React.ElementType> = {
  min_likes: Heart, min_replies: MessageCircle, min_reposts: Repeat2,
  min_quotes: MessageSquare, min_views: Eye, min_participants: Users, min_verified: BadgeCheck,
};

function NewCampaign() {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [funded, setFunded] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [prizeTouched, setPrizeTouched] = useState(false);
  const [poster, setPoster] = useState<{ name: string; handle: string; avatar: string | null } | null>(null);
  const [f, setF] = useState({
    title: "",
    prize: "",
    prize_amount: "",
    currency: "USDT",
    winners_count: 1,
    days: "1",
    requirement: "",
    tweet_url: "",
    keyword: "",
  });
  const [sel, setSel] = useState<Partial<Record<MetricKey, boolean>>>({ min_replies: true });
  const [vals, setVals] = useState<Record<MetricKey, string>>(
    () => Object.fromEntries(METRIC_KEYS.map((k) => [k, "100"])) as Record<MetricKey, string>,
  );
  const [payMethod, setPayMethod] = useState<"stripe" | "chain">("stripe");
  const [editing, setEditing] = useState(false);
  const [showStripeNote, setShowStripeNote] = useState(false);
  const { data: fees = [] } = useFeeTiers();
  const checkout = useServerFn(startStripeCheckout);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  const amount = f.prize_amount ? Number(f.prize_amount) : null;
  const winners = Math.max(1, Number(f.winners_count) || 1);
  const selKeys = METRIC_KEYS.filter((k) => sel[k]);

  function toggle(k: MetricKey) {
    if (k === "min_replies") return; // replies are the raffle entries — always required
    if (!sel[k] && selKeys.length >= MAX_CONDITIONS) { toast.error(t("f.pickMax")); return; }
    setSel({ ...sel, [k]: !sel[k] });
  }

  const conditions: Conditions = {};
  if (f.keyword.trim()) conditions.keyword = f.keyword.trim();
  for (const k of selKeys) {
    const n = Math.floor(Number(vals[k]));
    if (n > 0) conditions[k] = n;
  }

  const shareBase: ShareCampaign = {
    title: "", slug: "preview", prize: "",
    prize_amount: amount, currency: f.currency, winners_count: winners,
    share_language: lang, share_duration: f.days === "1h" ? 1 : Number(f.days), conditions, requirement: f.requirement,
    share_hours: f.days === "1h" ? 1 : Number(f.days) * 24,
  };

  // Prize description and title auto-generate until the user edits them by hand.
  const autoPrize = amount && amount > 0 ? prizeSummary({ ...shareBase, prize: f.prize }) : "";
  const prizeText = prizeTouched ? f.prize : autoPrize;

  const condNames = selKeys.map((k) => t(METRIC_LABEL[k]));
  const prizeTail = amount && amount > 0
    ? (lang === "zh" ? `赢 ${amount} ${f.currency}` : `to win ${amount} ${f.currency}`)
    : (lang === "zh" ? "抽奖" : "giveaway");
  const autoTitle = condNames.length
    ? `${condNames.join(" + ")} ${prizeTail}`
    : amount && amount > 0
      ? (lang === "zh" ? `${amount} ${f.currency} 抽奖` : `${amount} ${f.currency} giveaway`)
      : "";
  const titleText = titleTouched ? f.title : autoTitle;

  // Live preview of the share tweet the app generates after publishing.
  const origin = typeof window === "undefined" ? "https://fairdraw.win" : window.location.origin;
  const previewText = campaignTweet({ ...shareBase, title: titleText || t("f.title"), prize: prizeText }, origin);

  // Live ticket amounts — same fee math as the real FundingPanel.
  const pool = amount ?? 0;
  const fee = feeAmount(fees, pool);
  const total = pool + fee;
  const stripeOk = stripeSupports(f.currency);
  const chainOk = f.currency === "USDT";
  const effMethod: "stripe" | "chain" = payMethod === "stripe" && !stripeOk && chainOk ? "chain" : payMethod;
  const canPay = (effMethod === "stripe" && stripeOk) || (effMethod === "chain" && chainOk);

  // Hero progress steps: first incomplete step is "now".
  const pDone = [pool > 0, selKeys.length > 0, !!(titleText.trim() && prizeText.trim()), funded];
  const nowIdx = pDone.findIndex((d) => !d);
  const pLabels = [t("f.psPool"), t("f.psCond"), t("f.psContent"), t("f.psPay")];

  // Show the organiser's own X identity in the preview when they signed in with X.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const x = data.user?.identities?.find((i) => i.provider === "x" || i.provider === "twitter");
      const un = x?.identity_data?.user_name ?? x?.identity_data?.preferred_username ?? x?.identity_data?.screen_name;
      const nm = x?.identity_data?.name ?? data.user?.user_metadata?.full_name;
      const av = x?.identity_data?.avatar_url ?? x?.identity_data?.picture ?? x?.identity_data?.profile_image_url ?? data.user?.user_metadata?.avatar_url;
      if (typeof un === "string" && un)
        setPoster({ name: typeof nm === "string" && nm ? nm : un, handle: un, avatar: typeof av === "string" && av ? av : null });
    });
  }, []);

  /** Insert the campaign row, or update it when the organiser reopened it for edits. */
  async function ensureCreated(): Promise<Created | null> {
    const title = titleText.trim();
    const prize = prizeText.trim();
    if (!title) { toast.error(t("f.title")); return null; }
    if (!prize) { toast.error(t("f.prize")); return null; }
    if (!amount || amount <= 0) { toast.error(t("f.amount")); return null; }
    if (selKeys.length === 0) { toast.error(t("f.pickMin")); return null; }
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error(t("c.signin")); return null; }
    const payload = {
      owner_id: u.user.id,
      title,
      prize,
      prize_amount: amount,
      currency: f.currency.trim() || "USDT",
      // Declared pools await real funding (Stripe checkout or on-chain transfer) before the draw.
      escrow_status: "awaiting",
      winners_count: winners,
      share_language: lang,
      share_duration: f.days === "1h" ? 1 : Number(f.days),
      // Temporary test option: "1h" ends the campaign one hour from now.
      ends_at: f.days === "1h" ? new Date(Date.now() + 3600e3).toISOString() : endsAtFromDays(Number(f.days)),
      requirement: f.requirement.trim(),
      tweet_url: f.tweet_url.trim() || null,
      conditions,
    };
    const cols = "id, slug, title, prize, ends_at, prize_amount, currency, winners_count, share_language, share_duration, conditions, requirement, payment_method";
    if (created) {
      const { data, error } = await supabase.from("campaigns").update(payload).eq("id", created.id).select(cols).single();
      if (error) { toast.error(error.message); return null; }
      setCreated(data as Created);
      return data as Created;
    }
    const { data, error } = await supabase.from("campaigns").insert(payload).select(cols).single();
    if (error) { toast.error(error.message.includes("WEEKLY_LIMIT") ? t("f.limit") : error.message); return null; }
    setCreated(data as Created);
    return data as Created;
  }

  /** Single CTA: save the campaign then start the chosen payment flow. */
  async function payNow() {
    if (!canPay) return;
    setBusy(true);
    try {
      const c = await ensureCreated();
      if (!c) return;
      setEditing(false);
      const { error: pErr } = await supabase.from("campaigns").update({ payment_method: effMethod }).eq("id", c.id);
      if (pErr) { toast.error(pErr.message); return; }
      if (effMethod === "stripe") {
        const r = await checkout({ data: { campaignId: c.id, origin: window.location.origin } });
        if (r.url) window.location.href = r.url;
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Chain payments create/sync the row lazily: called by ChainFundingBody before each on-chain action. */
  async function ensureChainCampaign(): Promise<FundingCampaign | null> {
    const c = await ensureCreated();
    if (!c) return null;
    setEditing(false);
    const { error } = await supabase.from("campaigns").update({ payment_method: "chain" }).eq("id", c.id);
    if (error) { toast.error(error.message); return null; }
    return { ...c, payment_method: "chain" };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    void payNow();
  }

  if (created && funded) return <AfterCreate c={created} />;

  return (
    <div className="page-new-bg">
      <div style={{maxWidth:"1240px",margin:"0 auto",padding:"48px 24px 80px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:16,marginBottom:36}}>
        <div>
          <h1 style={{fontSize:"40px",fontWeight:700,letterSpacing:"-.01em",lineHeight:1.2}}>{t("new.title")}</h1>
          <p style={{color:"var(--muted-foreground)",marginTop:"8px"}}>{lang === "zh" ? "设好奖池和开奖条件，奖金托管在平台，达标后自动公开抽奖。" : "Set prize pool and conditions — funds escrowed, drawn on-chain when targets are met."}</p>
        </div>
        <div className="p-steps">
          {pLabels.map((lb, i) => (
            <Fragment key={lb}>
              {i > 0 && <div className="p-bar" />}
              <div className={`p-step${pDone[i] ? " done" : i === nowIdx ? " now" : ""}`}><i>{pDone[i] ? "\u2713" : i + 1}</i>{lb}</div>
            </Fragment>
          ))}
        </div>
      </div>
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_420px]">
      <form id="new-campaign" onSubmit={submit} className="space-y-0 panel-glass" style={{padding:"32px 36px"}}>
      <fieldset disabled={!!created && !editing} className="contents">
        <StepSection n={1} title={t("f.step1")} desc={t("f.step1D")} first>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("f.currency")}>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={f.currency} onChange={set("currency")}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              {f.currency !== "USDT" && <p style={{fontSize:12,color:"var(--destructive, #ef4444)",marginTop:4}}>{t("pay.nonUsdtHint")}</p>}
            </Field>
            <Field label={t("f.ends")}><select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={f.days} onChange={set("days")}><option value="1h">{t("f.hour1")}</option>{DURATIONS.map((d) => <option key={d} value={d}>{t(`f.day${d}` as "f.day1")}</option>)}</select></Field>
          </div>
          <Field label={t("f.amount")}><div className="amount-wrap"><Input required type="number" min={0.01} step="0.01" placeholder="20" value={f.prize_amount} onChange={set("prize_amount")} /><span className="amount-unit">{f.currency}</span></div></Field>
          <div className="flex flex-wrap gap-2">
            {PRESET_AMOUNTS.map((a) => (
              <button key={a} type="button" onClick={() => setF({ ...f, prize_amount: String(a) })}
                className={`chip-pill${Number(f.prize_amount) === a ? " on" : ""}`}>
                {a.toLocaleString("en-US")}
              </button>
            ))}
          </div>
          <Field label={t("f.winners")}><>
            <Input type="number" min={1} max={100} required list="winner-options" value={f.winners_count} onChange={set("winners_count")} />
            <datalist id="winner-options">{[1, 2, 3, 5, 10, 20, 50, 100].map((n) => <option key={n} value={n} />)}</datalist>
            {amount != null && amount > 0 && winners > 0 && (
              <p style={{fontSize:12,color:"var(--muted-foreground)",marginTop:6}}>{t("f.perWinner")} {(amount / winners).toFixed(2)} {f.currency}</p>
            )}
          </></Field>
        </StepSection>

        <StepSection n={2} title={t("f.step2")} desc={t("f.condHint")}>
          <Field label={t("f.keyword")}><Input maxLength={100} value={f.keyword} onChange={set("keyword")} /></Field>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">{t("f.condTitle")}</p>
            <span className="text-xs text-muted-foreground">{t("f.condCount")} {selKeys.length} / {MAX_CONDITIONS}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {METRIC_KEYS.map((k) => {
              const Icon = METRIC_ICON[k];
              return (
                <label key={k} className={`cond-card${sel[k] ? " active" : ""}`} style={{cursor: k === "min_replies" ? "default" : "pointer"}}>
                  <input type="checkbox" checked={!!sel[k]} disabled={k === "min_replies"} onChange={() => toggle(k)} className="sr-only" />
                  <span className="cond-ic"><Icon style={{width:18,height:18}} /></span>
                  <span style={{flex:1,fontWeight:500,fontSize:"14px"}}>
                    {t(METRIC_LABEL[k])}
                    {k === "min_replies" && <span style={{display:"block",fontSize:"11px",fontWeight:400,color:"var(--muted-foreground)"}}>· {t("f.required")}</span>}
                  </span>
                  {sel[k] && (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      ≥<Input type="number" min={1} className="h-[34px] w-14 px-2 text-xs" style={{borderRadius:"9px"}} value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} onClick={(e) => e.stopPropagation()} />
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </StepSection>

        <StepSection n={3} title={t("f.step3")} desc={t("f.step3D")}>
          <Field label={t("f.prize")}>
            <Input required maxLength={200} placeholder={t("f.prizePh")} value={prizeText} onChange={(e) => { setPrizeTouched(true); setF({ ...f, prize: e.target.value }); }} />
            <p className="text-xs text-muted-foreground">{t("f.prizeAuto")}</p>
          </Field>
          <Field label={t("f.title")}>
            <Input required maxLength={120} value={titleText} onChange={(e) => { setTitleTouched(true); setF({ ...f, title: e.target.value }); }} />
            <p className="text-xs text-muted-foreground">{t("f.titleAuto")}</p>
          </Field>
          <Field label={t("f.req")}><Textarea rows={3} maxLength={1000} placeholder={t("f.reqPh")} value={f.requirement} onChange={set("requirement")} /></Field>
          <div>
            <Field label={t("f.tweetUrl")}><Input type="url" placeholder="https://x.com/you/status/…" value={f.tweet_url} onChange={set("tweet_url")} /></Field>
            <div className="inline-note">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              <p>{t("f.tweetHint")}</p>
            </div>
          </div>
        </StepSection>
      </fieldset>
      </form>

      <aside className="flex flex-col gap-5 lg:sticky lg:self-start" style={{top:"88px"}}>
        <div className="panel-glass">
          <div className="card-h">
            <h3>{t("new.preview")}</h3>
            <span className="live-dot">{t("new.previewNow")}</span>
          </div>
          <div style={{margin:"14px 16px 16px"}}>
            <TweetPreview
              name={poster?.name ?? "FairDraw"}
              handle={poster?.handle ?? "fairdraw"}
              avatar={poster?.avatar ?? null}
              now={t("new.previewNow")}
              text={previewText}
            />
          </div>
        </div>
        {created && !editing && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-400">
            <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" />{t("f.confirmed")}</span>
            <button type="button" className="shrink-0 text-xs opacity-80 hover:underline hover:opacity-100" onClick={() => setEditing(true)}>{t("f.modify")}</button>
          </div>
        )}
        <PayTicket pool={pool} fee={fee} total={total} currency={f.currency} method={effMethod} setMethod={setPayMethod} stripeOk={stripeOk} chainOk={chainOk} canPay={canPay} busy={busy} setBusy={setBusy} onPay={payNow} getCampaign={ensureChainCampaign} onFunded={() => setFunded(true)} showStripeNote={showStripeNote} setShowStripeNote={setShowStripeNote} />
      </aside>
      </div>
      </div>
    </div>
  );
}

/** X-style post card mirroring the generated share tweet. */
function TweetPreview({ name, handle, avatar, now, text }: { name: string; handle: string; avatar: string | null; now: string; text: string }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4 text-[15px] leading-5 text-[#e7e9ea]">
      <div className="flex gap-3">
        {avatar && !imgErr ? (
          <img src={avatar} alt={name} className="size-10 shrink-0 rounded-full object-cover" onError={() => setImgErr(true)} />
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/20 font-bold text-primary">
            {name.trim().slice(0, 1).toUpperCase() || "F"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate font-bold">{name}</span>
            <span className="truncate text-[#71767b]">@{handle.replace(/^@/, "")} · {now}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words">{text}</p>
          <div className="mt-3 flex items-center justify-between text-[#71767b]">
            <span className="flex items-center gap-1 text-xs"><MessageCircle className="size-4" />0</span>
            <span className="flex items-center gap-1 text-xs"><Repeat2 className="size-4" />0</span>
            <span className="flex items-center gap-1 text-xs"><Heart className="size-4" />0</span>
            <span className="flex items-center gap-1 text-xs"><BarChart3 className="size-4" />0</span>
            <span className="flex items-center gap-2"><Bookmark className="size-4" /><Share className="size-4" /></span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Always-visible payment ticket: live pool+fee total, method tabs, single pay CTA that saves the campaign then starts checkout. */
function PayTicket({ pool, fee, total, currency, method, setMethod, stripeOk, chainOk, canPay, busy, setBusy, onPay, getCampaign, onFunded, showStripeNote, setShowStripeNote }: {
  pool: number; fee: number; total: number; currency: string;
  method: "stripe" | "chain"; setMethod: (m: "stripe" | "chain") => void;
  stripeOk: boolean; chainOk: boolean; canPay: boolean;
  busy: boolean; setBusy: (b: boolean) => void;
  onPay: () => void;
  getCampaign: () => Promise<FundingCampaign | null>;
  onFunded: () => void;
  showStripeNote: boolean; setShowStripeNote: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const chainName = chainConfig().chainName;
  return (
    <div className="ticket-wrap">
      <div className="ticket-inner">
        <div className="t-top">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <h3 style={{fontSize:16,fontWeight:700}}>{t("m.funding")}</h3>
            {method === "chain" && <span className="chain-badge">{chainName}</span>}
          </div>
          <p style={{fontSize:12,color:"var(--muted-foreground)",marginTop:18}}>{t("m.fundDue")}</p>
          <div className="t-amt">
            <span className="t-amt-big">{total.toFixed(2)}</span>
            <span className="t-amt-cur">{currency}</span>
          </div>
          <div className="t-break">
            <span>{t("m.fundPool")} <b>{pool.toFixed(2)}</b></span>
            <span>{t("m.fundFee")} <b>{fee.toFixed(2)}</b> {currency}</span>
          </div>
        </div>
        <div className="perf-notch" aria-hidden="true" />
        <div className="t-bot">
          <div className="seg-tabs" role="tablist">
            <span style={{display:"inline-block",flex:1}}>
              <button type="button" role="tab" aria-selected={false} style={{opacity:0.4,width:"100%",cursor:"not-allowed"}} onClick={() => setShowStripeNote(!showStripeNote)}>{t("pay.stripeTab")}</button>
            </span>
            <button type="button" role="tab" aria-selected={method === "chain"} disabled={!chainOk} onClick={() => chainOk && setMethod("chain")}>{t("pay.chainTab")}</button>
          </div>
          {showStripeNote && (
            <p style={{fontSize:12,color:"var(--muted-foreground)",marginTop:10,textAlign:"center",padding:"6px 10px",background:"rgba(255,255,255,.04)",borderRadius:8}}>{t("pay.stripeDisabled")}</p>
          )}
          {method === "stripe" && (
            <>
              <button type="button" className="btn-gradient" style={{marginTop:14}} disabled={busy || !canPay} onClick={onPay}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                {t("m.fundStripeBtn")} {total.toFixed(2)} {currency}
              </button>
              <div className="wallets-list"><span>VISA</span><span>Mastercard</span><span>Apple Pay</span><span>Google Pay</span><span>支付宝</span></div>
              <p style={{fontSize:11,color:"var(--muted-foreground)",textAlign:"center",marginTop:10}}>{t("m.fundStripeNote")}</p>
            </>
          )}
          {method === "chain" && (
            <ChainFundingBody getCampaign={getCampaign} total={total} busy={busy} setBusy={setBusy} onDone={onFunded} />
          )}
        </div>
        <div className="trust-line">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>
          {t("m.fundTrust")}
        </div>
      </div>
    </div>
  );
}

/** After the pool is funded: jump to X with the generated tweet pre-filled. */
function AfterCreate({ c }: { c: Created }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [origin, setOrigin] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => {
    let active = true;
    let localUrl: string | undefined;
    setImageError(false);
    async function generate() {
      try {
        const blob = await renderShareImage(c);
        localUrl = URL.createObjectURL(blob);
        if (active) setImage(localUrl);
        const path = `${c.id}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage.from("campaign-share").upload(path, blob, { contentType: "image/jpeg" });
        if (uploadError) throw new Error(uploadError.message);
        const { error: updateError } = await supabase.from("campaigns").update({ share_image_path: path }).eq("id", c.id);
        if (updateError) throw new Error(updateError.message);
      } catch { if (active) setImageError(true); }
    }
    void generate();
    return () => { active = false; if (localUrl) URL.revokeObjectURL(localUrl); };
  }, [c, attempt]);
  const text = campaignTweet(c, origin);
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-4xl font-semibold">{t("new.created")}</h1>
      <p className="mt-3 text-muted-foreground">{t("new.createdSub")}</p>

      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">{t("new.stepTweet")} · {t("new.tweetPreview")}</p>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-muted p-4 font-mono text-sm">{text}</pre>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="flex-1">
            <a href={intent} target="_blank" rel="noopener noreferrer">{t("new.postToX")} ↗</a>
          </Button>
          <Button variant="outline" onClick={() => { navigator.clipboard.writeText(text); toast.success(t("c.copied")); }}>
            {t("new.copyText")}
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{t("new.afterPost")}</p>
      </div>

      <section className="mt-8 space-y-3">
        <h2 className="font-semibold">{t("share.image")}</h2>
        {image && <img src={image} alt={c.title} width={1200} height={630} className="aspect-[1200/630] w-full rounded-lg border border-border object-contain" />}
        {image && <Button asChild variant="outline"><a href={image} download={`fairdraw-${c.slug}.jpg`}><Download className="size-4" />{t("share.download")}</a></Button>}
        {imageError && <div className="space-y-2"><p className="text-sm text-destructive">{t("share.imageError")}</p><Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t("share.retry")}</Button></div>}
        {!image && !imageError && <p className="text-muted-foreground">{t("common.loading")}</p>}
      </section>

      <Button className="mt-6 w-full" variant="secondary" onClick={() => navigate({ to: "/manage/$id", params: { id: c.id } })}>
        {t("new.goManage")}
      </Button>
      <p className="mt-4 text-center text-sm">
        <Link to="/dashboard" className="text-primary hover:underline">{t("nav.dashboard")}</Link>
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function StepSection({ n, title, desc, children, first = false }: { n: number; title: string; desc?: string; children: React.ReactNode; first?: boolean }) {
  return (
    <div className={`space-y-4 py-8 ${first ? "" : "border-t border-[rgba(255,255,255,.07)]"}`}>
      <div className="sec-h">
        <span className="sec-n">{n}</span>
        <h2 style={{fontSize:"18px",fontWeight:700}}>{title}</h2>
      </div>
      {desc && <p className="sec-d">{desc}</p>}
      {children}
    </div>
  );
}
