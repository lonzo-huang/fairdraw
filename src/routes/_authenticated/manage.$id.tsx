import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { translate, useI18n, type Lang } from "@/lib/i18n";
import { CANCEL_WINDOW_MS, cancelCampaign, checkCampaignConditions, deleteCampaign, drawCampaign, refundEscrow, updateCampaignConditions } from "@/lib/campaign.functions";
import { payoutViaStripe, recordChainPayout, refundChainEscrow, updateCampaignAmount } from "@/lib/payment.functions";
import { computeProgress, parseConditions, type ConditionCheck, type Conditions, type Metrics } from "@/lib/conditions";
import { campaignTweet } from "@/lib/campaign-share";
import { hasEthereum, refundEscrowTx, sendTokenTransfer } from "@/lib/wallet";
import { chainConfig } from "@/lib/payments";
import { feeAmount, feeRate } from "@/lib/fees";
import { poolFunded } from "@/lib/campaign-hub";
import { useFeeTiers } from "@/hooks/use-fee-tiers";
import { ChainFundingBody } from "@/components/funding-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowUpRight, BadgeCheck, Check, CheckCircle2, Copy, Eye, Heart, Link2, Lock, MessageCircle, MessageSquare, MoreHorizontal, RefreshCw, Repeat2, Search, ShieldCheck, Users } from "lucide-react";

export const NUM_COND_KEYS = ["min_likes", "min_replies", "min_reposts", "min_quotes", "min_views", "min_participants", "min_verified"] as const;
const COND_LABEL: Record<(typeof NUM_COND_KEYS)[number], "cond.likes" | "cond.replies" | "cond.reposts" | "cond.quotes" | "cond.views" | "cond.participants" | "cond.verified"> = {
  min_likes: "cond.likes", min_replies: "cond.replies", min_reposts: "cond.reposts",
  min_quotes: "cond.quotes", min_views: "cond.views",
  min_participants: "cond.participants", min_verified: "cond.verified",
};

const COND_ICON: Record<(typeof NUM_COND_KEYS)[number], typeof Heart> = {
  min_likes: Heart, min_replies: MessageCircle, min_reposts: Repeat2,
  min_quotes: MessageSquare, min_views: Eye,
  min_participants: Users, min_verified: BadgeCheck,
};

export const Route = createFileRoute("/_authenticated/manage/$id")({
  head: () => ({ meta: [
    { title: "Manage campaign — FairDraw" },
    { name: "description", content: "Review participants, draw winners and record payout proof on FairDraw." },
    { property: "og:title", content: "Manage campaign — FairDraw" },
    { property: "og:description", content: "Review participants, draw winners and record payout proof on FairDraw." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Manage,
});

function Manage() {
  const { id } = Route.useParams();
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const checkConds = useServerFn(checkCampaignConditions);
  const refund = useServerFn(refundEscrow);
  const cancel = useServerFn(cancelCampaign);
  const draw = useServerFn(drawCampaign);
  const delCamp = useServerFn(deleteCampaign);
  const updateAmount = useServerFn(updateCampaignAmount);
  const { data: fees = [] } = useFeeTiers();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [condResult, setCondResult] = useState<{ checks: ConditionCheck[]; progress: number } | null>(null);
  const [link, setLink] = useState("");
  const [linkBad, setLinkBad] = useState(false);
  const [linkEdit, setLinkEdit] = useState(false);
  const [editAmount, setEditAmount] = useState<string | null>(null);
  const [editConds, setEditConds] = useState(false);
  const [drawMode, setDrawMode] = useState<"all" | "verified" | "weighted">("all");
  const [wBlue, setWBlue] = useState("1.2");
  const [wNormal, setWNormal] = useState("0.4");
  const [showAllP, setShowAllP] = useState(false);
  const [entryTab, setEntryTab] = useState<"all" | "valid" | "invalid">("all");
  const [amountOpen, setAmountOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showStripeNote, setShowStripeNote] = useState(false);
  const [, forceTick] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["manage", id],
    queryFn: async () => {
      const [{ data: c }, { data: entries }, { data: payouts }, { data: snap }] = await Promise.all([
        supabase.from("campaigns").select("*").eq("id", id).single(),
        supabase.from("entries").select("*").eq("campaign_id", id).order("created_at"),
        supabase.from("payouts").select("*").eq("campaign_id", id),
        // Latest cron check snapshot — lets the progress card render without a manual check.
        supabase.from("condition_snapshots").select("fetched_at, metrics").eq("campaign_id", id).order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return { c, entries: entries ?? [], payouts: payouts ?? [], snap };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["manage", id] });

  // Close the "more" menu on outside click; 1 s tick drives the live countdown.
  // contains-check: React delegates listeners on document, so stopPropagation
  // on the toggle cannot stop a sibling document listener in the same dispatch.
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("click", close);
    const iv = setInterval(() => forceTick((v) => v + 1), 1000);
    return () => { document.removeEventListener("click", close); clearInterval(iv); };
  }, []);

  if (isLoading || !data?.c) return <p className="p-10 text-center text-muted-foreground">{t("common.loading")}</p>;
  const { c, entries, payouts, snap } = data;
  const open = c.status === "open";
  const drawn = c.status === "drawn";
  const cancelled = c.status === "cancelled";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = `${origin}/c/${c.slug}`;
  const conditions = parseConditions(c.conditions);
  const hasConds = Object.values(conditions).some((v) => v !== undefined);
  const snapM = (snap?.metrics ?? null) as Metrics | null;
  // A manual check outranks the latest cron snapshot until the next refresh.
  const cond = condResult ?? (snapM ? computeProgress(conditions, snapM) : null);
  const allMet = !hasConds || (cond !== null && cond.checks.length > 0 && cond.checks.every((ch) => ch.state === "met"));
  const now = Date.now();
  const pastDeadline = Date.parse(c.ends_at) < now;
  const leftMs = Math.max(0, Date.parse(c.ends_at) - now);
  const unfunded = !poolFunded(c);
  const canCancel = open && Date.parse(c.created_at) + CANCEL_WINDOW_MS > now;
  const pool = c.prize_amount ?? 0;
  const fee = feeAmount(fees, pool);
  const feePct = feeRate(fees, pool);
  const total = pool + fee;
  // Wizard phase mirrors the mockup: 1 fund → 2 link post → 3 live; terminal states render all steps done.
  const phase = !open ? 3 : unfunded ? 1 : !c.tweet_url ? 2 : 3;
  const badge: [string, string] = cancelled ? ["b-end", t("status.cancelled")]
    : drawn ? ["b-done", t("status.drawn")]
    : phase === 1 ? ["b-wait", t("m.badgeFund")]
    : phase === 2 ? ["b-wait", t("m.badgeLink")]
    : ["b-live", t("status.open")];
  const chainOk = c.currency === "USDT" || c.currency === "USDC";
  const tw = campaignTweet(c, origin);
  const durH = Math.max(1, Math.round((Date.parse(c.ends_at) - Date.parse(c.created_at)) / 3600e3));
  const cdS = Math.floor(leftMs / 1000);
  const cdH = Math.floor(cdS / 3600);
  const cdM = Math.floor((cdS % 3600) / 60);
  const cdSec = cdS % 60;
  // Headline number prefers a replies goal, then the first numeric check.
  const repCheck = cond?.checks.find((ch) => ch.key === "min_replies")
    ?? cond?.checks.find((ch) => typeof ch.target === "number" && typeof ch.current === "number");
  const pct = cond?.progress ?? 0;
  const linkM = link.trim().match(TW_RE);
  const linkHandle = linkM?.[3] ?? "";
  const linkMsg: { kind: "info" | "ok" | "err"; text: string } =
    linkBad && !link.trim() ? { kind: "err", text: t("m.linkEmpty") }
    : linkBad && !linkM ? { kind: "err", text: t("m.linkBad") }
    : !link.trim() ? { kind: "info", text: t("m.linkHint") }
    : linkM ? { kind: "ok", text: t("m.linkOk") }
    : { kind: "info", text: t("m.linkShape") };
  const isInvalidEntry = (e: (typeof entries)[number]) =>
    e.eligibility_status === "ineligible" ||
    (e.fetched_meta as { handle_match?: boolean | null } | null)?.handle_match === false;
  const pCnt = {
    all: entries.length,
    valid: entries.filter((e) => !isInvalidEntry(e)).length,
    invalid: entries.filter((e) => isInvalidEntry(e)).length,
  };
  const shownEntries = entryTab === "all" ? entries : entries.filter((e) => (entryTab === "invalid") === isInvalidEntry(e));
  // Draw gating mirrors the product flow: funded pool, participants, and either
  // all conditions met or the deadline reached (owners can relax conditions to end early).
  const drawBlock = !open ? null
    : entries.length === 0 ? t("m.drawNoEntries")
    : unfunded ? t("m.drawUnfunded")
    : hasConds && cond === null ? t("m.drawNoSync")
    : !allMet && !pastDeadline ? t("m.drawWaitConds")
    : null;
  const condItems: { k: string; I: typeof Heart; txt: string }[] = NUM_COND_KEYS.filter((k) => conditions[k] !== undefined)
    .map((k) => ({ k, I: COND_ICON[k], txt: `${t(COND_LABEL[k])} ≥ ${conditions[k]}` }));
  if (conditions.keyword) condItems.push({ k: "keyword", I: Search, txt: `${t("cond.keyword")} · ${conditions.keyword}` });
  const winnersShare = c.prize_amount && c.winners_count > 0 ? Number((c.prize_amount / c.winners_count).toFixed(6)) : null;
  const copyText = (s: string, msg?: string) => { navigator.clipboard.writeText(s).catch(() => {}); toast.success(msg ?? t("c.copied")); };
  const copyShare = () => copyText(shareUrl);

  async function doDraw() {
    if (!confirm(t("m.drawConfirm"))) return;
    setBusy(true);
    try {
      await draw({
        data: {
          campaignId: c!.id,
          mode: drawMode,
          weights: drawMode === "weighted"
            ? { blue: Number(wBlue) || 1, normal: Number(wNormal) || 1 }
            : undefined,
        },
      });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function runCondCheck() {
    setChecking(true);
    try {
      const r = await checkConds({ data: { campaignId: c!.id } });
      if (r.deleted) {
        toast.error(t("m.tweetGone"));
        refresh();
        return;
      }
      setCondResult({ checks: r.checks as ConditionCheck[], progress: r.progress });
      toast.success(`${r.progress}%`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setChecking(false);
    }
  }
  async function linkTweet() {
    const v = link.trim();
    if (!v || !linkM) { setLinkBad(true); return; }
    setLinkBusy(true);
    const { error } = await supabase.from("campaigns").update({ tweet_url: v }).eq("id", c!.id);
    setLinkBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(t("m.linked")); setLink(""); setLinkEdit(false); refresh(); }
  }
  async function doUpdateAmount() {
    const n = Number(editAmount ?? c!.prize_amount);
    if (!(n > 0)) { toast.error("Invalid amount"); return; }
    setBusy(true);
    try {
      const r = await updateAmount({ data: { campaignId: c!.id, amount: n, origin: window.location.origin } });
      if (r.checkoutUrl) { window.location.href = r.checkoutUrl; return; }
      toast.success(t("common.save"));
      setEditAmount(null);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function doCancel() {
    if (!confirm(t("m.cancelConfirm"))) return;
    setBusy(true);
    try {
      await cancel({ data: { campaignId: c!.id } });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function doRefund() {
    if (!confirm(t("m.refundConfirm"))) return;
    setBusy(true);
    try {
      await refund({ data: { campaignId: c!.id } });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function del() {
    if (!confirm(t("m.delete") + "?")) return;
    setBusy(true);
    try {
      await delCamp({ data: { campaignId: c!.id } });
      navigate({ to: "/dashboard" });
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="page-mg mx-auto max-w-[1200px] px-4 pb-20 pt-8 md:px-6">
      {/* Breadcrumb + title row */}
      <div className="crumb">
        <Link to="/dashboard">{t("dash.title")}</Link><span>/</span><span>{t("m.crumbDetail")}</span>
      </div>
      <div className="head">
        <div>
          <h1>
            {c.title}
            {c.prize_amount !== null && <span className="amt">· {c.prize_amount} {c.currency}</span>}
            <span className={`badge ${badge[0]}`}>{badge[1]}</span>
            {c.is_simulated && <span className="badge b-sim">{t("sim.tag")}</span>}
          </h1>
          <div className="meta">
            <span>{t("m.idLbl")} <code>{c.id.slice(0, 10)}</code></span>
            <button type="button" className="copy-i" onClick={() => copyText(c.id)}><Copy />{t("m.copyId")}</button>
            <span>{t("m.createdOn")} {new Date(c.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="head-r">
          {phase === 3 && <button type="button" className="ghost" onClick={copyShare}><Link2 />{t("m.copyLink")}</button>}
          {drawn && <Link to="/r/$slug" params={{ slug: c.slug }} className="ghost"><ArrowUpRight />{t("c.result")}</Link>}
          <div className="menu-anchor" ref={menuRef}>
            <button type="button" className="ghost" aria-haspopup="true" aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}>
              <MoreHorizontal />{t("m.more")}
            </button>
            {menuOpen && (
              <div className="menu">
                <button type="button" onClick={copyShare}>{t("m.copyLink")}</button>
                {open && c.tweet_url && <button type="button" onClick={() => setLinkEdit(true)}>{t("m.postChange")}</button>}
                {open && <button type="button" onClick={() => setEditConds((v) => !v)}>{t("m.editConds")}</button>}
                {canCancel && <button type="button" className="danger" onClick={doCancel}>{t("m.menuCancel")}</button>}
                <button type="button" className="danger" onClick={del}>{t("m.delete")}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3-step wizard */}
      <div className="stepper">
        {[
          { title: t("m.stepFund"), sub: translate(lang, "m.stepFundSub", { amt: pool ? `${total.toFixed(2)} ${c.currency}` : "—" }) },
          { title: t("m.stepPost"), sub: t("m.stepPostSub") },
          { title: t("m.stepDraw"), sub: t("m.stepDrawSub") },
        ].map((sp, i) => {
          const n = i + 1;
          const cls = !open ? "done" : n < phase ? "done" : n === phase ? "now" : "";
          return (
            <div key={n} className={`sp ${cls}`}>
              <span className="n">{cls === "done" ? <Check /> : n}</span>
              <div><div className="t">{sp.title}</div><div className="s">{sp.sub}</div></div>
            </div>
          );
        })}
      </div>

      <div className="mg-grid">
        <div className="main">
          {/* completed-step summaries */}
          {phase >= 2 && pool > 0 && (
            <div className="mini done">
              <span className="n"><Check /></span>
              <div><div className="t">{t("m.donePoolT")}</div><div className="s">{total.toFixed(2)} {c.currency} · {t(`pay.${c.payment_method ?? "manual"}` as "pay.manual")}</div></div>
              <span className="r">{t("m.done")}</span>
            </div>
          )}
          {phase === 3 && c.tweet_url && (
            <div className="mini done">
              <span className="n"><Check /></span>
              <div style={{ minWidth: 0 }}>
                <div className="t">{t("m.doneLinkT")}</div>
                <div className="s" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.tweet_url}</div>
              </div>
              <a className="r" href={c.tweet_url} target="_blank" rel="noopener noreferrer">{t("m.openPost")}</a>
            </div>
          )}
          {/* step 1 — fund the pool */}
          {phase === 1 && (
            <section className="panel card">
              <div className="card-h"><div>
                <div className="eyebrow">{translate(lang, "m.stepOf", { n: 1 })}</div>
                <h2>{t("m.stepFund")}</h2>
                <p>{t("m.payDesc")}</p>
              </div></div>
              <div className="pay">
                <div>
                  <div style={{ fontSize: 13, color: "#646f85" }}>{t("m.fundDue")}</div>
                  <div className="amt-big"><span className="v">{total.toFixed(2)}</span><span className="c">{c.currency}</span></div>
                  <div className="brk">
                    <div><span>{t("m.fundPool")}</span><b>{pool.toFixed(2)}</b></div>
                    <div><span>{t("m.fundFee")} {feePct}%</span><b>{fee.toFixed(2)}</b></div>
                    <div className="tot"><span>{t("m.tot")}</span><b>{total.toFixed(2)} {c.currency}</b></div>
                  </div>
                </div>
                <div>
                  <div className="seg" role="tablist">
                    {/* Online payment isn't live yet — clicking shows the same note as on the create page. */}
                    <button type="button" role="tab" aria-selected="false" aria-disabled="true" onClick={() => setShowStripeNote((v) => !v)}>{t("pay.stripeTab")}</button>
                    <button type="button" role="tab" aria-selected={chainOk} disabled={!chainOk}>{t("pay.chainTab")}</button>
                  </div>
                  {showStripeNote && (
                    <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 10, textAlign: "center", padding: "6px 10px", background: "rgba(255,255,255,.04)", borderRadius: 8 }}>{t("pay.stripeDisabled")}</p>
                  )}
                  <div style={{ marginTop: 14 }}>
                    {chainOk ? (
                      <ChainFundingBody getCampaign={() => Promise.resolve(c)} total={total} busy={busy} setBusy={setBusy} onDone={refresh} />
                    ) : (
                      <p className="fine">{t("pay.nonUsdtHint")}</p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* step 2 — post & link the tweet */}
          {(phase === 2 || (phase === 3 && open && linkEdit)) && (
            <section className="panel card">
              <div className="card-h"><div>
                <div className="eyebrow">{translate(lang, "m.stepOf", { n: 2 })}</div>
                <h2>{t("m.stepPost")}</h2>
                <p>{translate(lang, "m.stepPostDesc", { h: durH })}</p>
              </div></div>
              <span className="lbl">{t("m.tweetLbl")}</span>
              <div className="compose">
                <div className="compose-t">{linkify(tw)}</div>
                <div className="compose-f">
                  <span className="cnt">{[...tw].length} / 280</span>
                  <div className="acts">
                    <button type="button" className="ghost" onClick={() => copyText(tw)}><Copy />{t("new.copyText")}</button>
                    <a className="xbtn" href={`https://x.com/intent/post?text=${encodeURIComponent(tw)}`} target="_blank" rel="noopener noreferrer"><XIcon />{t("m.postOnX")}</a>
                  </div>
                </div>
              </div>
              <div className="or">{t("m.orPaste")}</div>
              <label className="lbl" htmlFor="mg-link">{t("m.linkLbl")}</label>
              <div className="link-row">
                <input id="mg-link" className={`in${linkBad ? " bad" : ""}`} placeholder={t("m.linkPh")}
                  spellCheck={false} autoComplete="off" value={link}
                  onChange={(e) => { setLink(e.target.value); setLinkBad(false); }} />
                <button type="button" className="mbtn auto" disabled={linkBusy} onClick={linkTweet}>
                  {linkBusy ? t("m.linking") : t("m.linkBtn")}
                </button>
              </div>
              <div className={`msg ${linkMsg.kind}`}>{linkMsg.text}</div>
              {linkM && (
                <div className="tw-prev">
                  <span className="av" style={{ background: avColor(linkHandle) }}>{linkHandle.slice(0, 1).toUpperCase()}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="x1"><b>{linkHandle}</b> <span>@{linkHandle}</span></div>
                    <div className="x2">{tw.split("\n")[0]}</div>
                  </div>
                  <span className="ck"><CheckCircle2 /></span>
                </div>
              )}
            </section>
          )}

          {/* step 3 — live progress & draw */}
          {phase === 3 && (
            <section className="panel card">
              <div className="card-h">
                <div>
                  <div className="eyebrow">{translate(lang, "m.stepOf", { n: 3 })}</div>
                  <h2>{t("m.progressTitle")}</h2>
                  <p>{t("m.progSub")}</p>
                </div>
                {open && (
                  <button type="button" className="ghost" disabled={checking} onClick={runCondCheck}>
                    <RefreshCw className={checking ? "mgspin" : ""} />{checking ? t("m.updating") : t("m.updNow")}
                  </button>
                )}
              </div>
              <div className="prog-top">
                <div>
                  {repCheck ? (
                    <div className="prog-v">{typeof repCheck.current === "number" ? repCheck.current : 0}<small> / {repCheck.target} {t("m.repliesUnit")}</small></div>
                  ) : (
                    <div className="prog-v">{pct}<small>%</small></div>
                  )}
                  <div className="prog-l">
                    {repCheck && typeof repCheck.target === "number" && typeof repCheck.current === "number"
                      ? translate(lang, "m.leftToDraw", { n: Math.max(0, repCheck.target - repCheck.current) })
                      : !hasConds ? t("cond.none") : cond === null ? t("m.noSnap") : allMet ? t("m.nextDraw") : `${pct}%`}
                  </div>
                </div>
                {open && (
                  <div className="cd" aria-label={t("m.timeLeft")}>
                    <div><b>{pad2(cdH)}</b><span>{t("m.hUnit")}</span></div>
                    <div><b>{pad2(cdM)}</b><span>{t("m.mUnit")}</span></div>
                    <div><b>{pad2(cdSec)}</b><span>{t("m.sUnit")}</span></div>
                  </div>
                )}
              </div>
              <div className="bar"><i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>
              <div className="bar-f">
                <span>{t("m.lastSync")} {snap ? fmtRel(snap.fetched_at, lang) : "—"}</span>
                <span>{pastDeadline ? t("m.ended") : `${t("m.timeLeft")} ${fmtLeft(leftMs)}`}</span>
              </div>
              {cond && cond.checks.length > 1 && (
                <div className="plist" style={{ marginTop: 14 }}>
                  {cond.checks.map((ch) => (
                    <div key={ch.key} className="pr">
                      <div>
                        <div className="nm">{t(`cond.${ch.label}` as "cond.likes")}</div>
                        <div className="hd"><span className="num">{typeof ch.current === "number" ? ch.current : "—"} / {ch.target}</span></div>
                      </div>
                      <span className={`tag ${ch.state === "met" ? "ok" : "no"}`}>
                        {ch.state === "met" ? t("cond.met") : ch.state === "unmet" ? t("cond.unmet") : t("cond.unknown")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {open && (drawBlock ? (
                <div className="draw-note"><Lock />{t("m.drawNote")}{drawBlock !== t("m.drawWaitConds") ? ` · ${drawBlock}` : ""}</div>
              ) : (
                <div className="drawrow">
                  <select className="msel" value={drawMode} onChange={(e) => setDrawMode(e.target.value as typeof drawMode)}>
                    <option value="all">{t("m.modeAll")}</option>
                    <option value="verified">{t("m.modeVerified")}</option>
                    <option value="weighted">{t("m.modeWeighted")}</option>
                  </select>
                  {drawMode === "weighted" && (
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#646f85" }}>
                      {t("m.wBlue")}<input className="in" style={{ width: 60, height: 40 }} value={wBlue} onChange={(e) => setWBlue(e.target.value)} />
                      {t("m.wNormal")}<input className="in" style={{ width: 60, height: 40 }} value={wNormal} onChange={(e) => setWNormal(e.target.value)} />
                    </span>
                  )}
                  <button type="button" className="mbtn auto" disabled={busy} onClick={doDraw}>{t("m.draw")}</button>
                  {!allMet && <span style={{ fontSize: 12, color: "#f5b83d" }}>{t("m.drawUnmet")}</span>}
                </div>
              ))}
              {drawn && (
                <div className="drawrow">
                  <Link to="/r/$slug" params={{ slug: c.slug }} className="mbtn auto" style={{ textDecoration: "none" }}>{t("c.result")}</Link>
                </div>
              )}
              {cancelled && <div className="draw-note">{t("m.nextCancelled")}</div>}
            </section>
          )}

          {/* participants */}
          {phase === 3 && (
            <section className="panel card">
              <div className="card-h" style={{ alignItems: "center" }}>
                <div><h2>{t("m.partyTitle")}</h2></div>
                <div className="ptabs" role="tablist">
                  {(["all", "valid", "invalid"] as const).map((k) => (
                    <button key={k} type="button" role="tab" aria-selected={entryTab === k} onClick={() => setEntryTab(k)}>
                      {t(k === "all" ? "m.tabAll" : k === "valid" ? "m.tabValid" : "m.tabInvalid")}
                      <b>{pCnt[k]}</b>
                    </button>
                  ))}
                </div>
              </div>
              <div className="plist">
                {shownEntries.length === 0 ? (
                  <p style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#646f85" }}>
                    {open && <span className="live-dot" />}{t(open ? "m.importing" : "m.noEntries")}
                  </p>
                ) : (
                  shownEntries.slice(0, showAllP ? shownEntries.length : 8).map((e) => {
                    const meta = e.fetched_meta as { author_name?: string; text?: string; reply_time?: string; handle_match?: boolean | null; x_verified?: boolean | null } | null;
                    const invalid = isInvalidEntry(e);
                    const nm = meta?.author_name ?? e.handle;
                    return (
                      <div key={e.id} className="pr">
                        <span className="av" style={{ background: avColor(e.handle) }}>{nm.slice(0, 1).toUpperCase()}</span>
                        <div style={{ minWidth: 0 }}>
                          <div className="nm" title={meta?.text ?? undefined}><a href={e.post_url} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>{nm}</a></div>
                          <div className="hd">@{e.handle}{meta?.x_verified ? " · ✓" : ""}</div>
                        </div>
                        <span className="tm">{fmtRel(meta?.reply_time ?? e.created_at, lang)}</span>
                        <span className={`tag ${invalid ? "no" : "ok"}`}>{invalid ? (meta?.handle_match === false ? t("m.handleMismatch") : t("m.ineligible")) : t("m.eligible")}</span>
                      </div>
                    );
                  })
                )}
                {!showAllP && shownEntries.length > 8 && (
                  <div className="pr" style={{ justifyContent: "center" }}>
                    <button type="button" className="copy-i" style={{ fontSize: 13 }} onClick={() => setShowAllP(true)}>
                      {translate(lang, "m.viewAllP", { n: shownEntries.length })}
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* locked future steps */}
          {phase < 2 && (
            <div className="mini lock"><span className="n">2</span><div><div className="t">{t("m.stepPost")}</div><div className="s">{t("m.lockPost")}</div></div></div>
          )}
          {phase < 3 && (
            <div className="mini lock"><span className="n">3</span><div><div className="t">{t("m.stepDraw")}</div><div className="s">{t("m.lockDraw")}</div></div></div>
          )}
        </div>

        {/* Side column: overview + trust */}
        <aside className="side">
          <div className="panel ov">
            <h3>{t("m.overview")}</h3>
            <div className="ov-prize">
              <div className="v">{c.prize_amount ?? c.prize}{c.prize_amount ? <small>{c.currency}</small> : null}</div>
              <div className="s">
                {winnersShare !== null
                  ? translate(lang, "m.ovSub", { n: c.winners_count, amt: `${winnersShare} ${c.currency}` })
                  : `${c.winners_count} ${t("c.winners")}`}
              </div>
            </div>
            <dl>
              <dt>{t("m.ovCond")}</dt>
              <dd>{condItems.length ? condItems.map(({ k, I, txt }) => <span key={k} className="cond"><I />{txt}</span>) : t("m.ovNoConds")}</dd>
              <dt>{t("m.ovHow")}</dt><dd>{t("m.ovReply")}</dd>
              <dt>{t("m.ovDur")}</dt><dd>{translate(lang, "m.hours", { h: durH })}</dd>
              <dt>{open && !c.tweet_url ? t("m.ovStart") : t("m.ovEnds")}</dt>
              <dd>{open && !c.tweet_url ? t("m.afterLink") : new Date(c.ends_at).toLocaleString()}</dd>
              <dt>{t("m.fundTitle")}</dt>
              <dd>{c.is_simulated ? t("sim.noPayout") : t(`escrow.${c.escrow_status}` as "escrow.funded")}</dd>
            </dl>
            {open && (
              <div className="edit">
                {canCancel && c.prize_amount !== null && (
                  <button type="button" className="ghost" onClick={() => { setEditAmount(String(c.prize_amount)); setAmountOpen(true); }}>{t("m.fundAdjust")}</button>
                )}
                <button type="button" className="ghost" onClick={() => setEditConds((v) => !v)}>{t("m.editConds")}</button>
              </div>
            )}
            {open && editConds && <ConditionEditor c={c} onDone={refresh} />}
          </div>
          <div className="panel trust">
            <ShieldCheck />
            <div><b>{t("m.trustT")}</b>{t("m.trustB")}</div>
          </div>
          {open && (c.escrow_status === "preauthorized" || (c.escrow_status === "funded" && c.payment_method !== "chain")) && pastDeadline && (
            <button type="button" className="ghost" style={{ justifyContent: "center" }} disabled={busy} onClick={doRefund}>{t("m.refund")}</button>
          )}
          {(c.escrow_status === "refund_pending" || (open && c.escrow_status === "funded" && c.payment_method === "chain" && pastDeadline)) && (
            <ChainRefund campaignId={c.id} busy={busy} setBusy={setBusy} onDone={refresh} />
          )}
        </aside>
      </div>

      {payouts.length > 0 && (
        <section className="panel card" style={{ marginTop: 24 }}>
          <div className="card-h"><div><h2>{t("m.payouts")}</h2></div></div>
          {c.is_simulated && <p className="fine" style={{ marginTop: 8 }}>{t("sim.banner")}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {payouts.map((p) => (
              <PayoutRow key={p.id} p={p} share={c.prize_amount && c.winners_count > 0 ? Number(c.prize_amount) / c.winners_count : null} currency={c.currency} paymentMethod={c.payment_method} onDone={refresh} />
            ))}
          </div>
        </section>
      )}

      {/* Pool amount change lives in a dialog — not inline */}
      <Dialog open={amountOpen} onOpenChange={setAmountOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("m.fundAdjust")}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input type="number" min={0.01} step="0.01" value={editAmount ?? ""} onChange={(e) => setEditAmount(e.target.value)} />
            <Button size="sm" disabled={busy} onClick={doUpdateAmount}>{t("m.updateAmount")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Compact countdown for the progress card footer. */
function fmtLeft(ms: number): string {
  const m = Math.ceil(ms / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

/** Valid X/Twitter status URL — same shape as the mockup validator. */
const TW_RE = /^https?:\/\/(www\.)?(x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(\?.*)?$/;

const AV_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#64748b", "#0ea5e9", "#14b8a6"];
/** Deterministic avatar colour by handle — same palette idea as the mockup list. */
function avColor(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length] ?? AV_COLORS[0];
}

function pad2(n: number) { return String(n).padStart(2, "0"); }

/** Compose preview: render the campaign URL as a blue X-style link. */
function linkify(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((p, i) =>
    /^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a> : p,
  );
}

/** Compact relative time for snapshots and participant rows. */
function fmtRel(iso: string, lang: Lang) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return translate(lang, "m.justNow");
  if (s < 3600) return translate(lang, "m.agoMin", { n: Math.floor(s / 60) });
  if (s < 86400) return translate(lang, "m.agoHr", { n: Math.floor(s / 3600) });
  return new Date(iso).toLocaleDateString();
}

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.2 2.3h3.4l-7.4 8.4 8.7 11.5h-6.8l-5.3-7-6.1 7H1.3l7.9-9L.9 2.3h7l4.8 6.4 5.5-6.4Zm-1.2 17.9h1.9L7.1 4.2H5.1l11.9 16Z"/></svg>
);

/**
 * Looser-only conditions editor: every configured metric can be lowered or
 * removed, keyword can be removed — the server rejects tightening.
 */
function ConditionEditor({ c, onDone }: { c: { id: string; conditions: unknown }; onDone: () => void }) {
  const { t } = useI18n();
  const update = useServerFn(updateCampaignConditions);
  const init = parseConditions(c.conditions);
  const [vals, setVals] = useState<Record<string, string>>(
    () => Object.fromEntries(NUM_COND_KEYS.filter((k) => init[k] !== undefined).map((k) => [k, String(init[k])])) as Record<string, string>,
  );
  const [keyword, setKeyword] = useState(init.keyword ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    const next: Conditions = {};
    if (keyword.trim()) next.keyword = keyword.trim();
    for (const k of NUM_COND_KEYS) {
      const n = Math.floor(Number(vals[k]));
      if (n > 0) next[k] = n;
    }
    setBusy(true);
    try {
      await update({ data: { campaignId: c.id, conditions: next } });
      toast.success(t("common.save"));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2 rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{t("m.condLooserHint")}</p>
      {init.keyword !== undefined && (
        <div className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0">{t("cond.keyword")}</span>
          <Input className="h-8" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <Button size="sm" variant="ghost" onClick={() => setKeyword("")}>✕</Button>
        </div>
      )}
      {NUM_COND_KEYS.filter((k) => init[k] !== undefined).map((k) => (
        <div key={k} className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0">{t(COND_LABEL[k])}</span>
          <span className="text-muted-foreground">≥</span>
          <Input type="number" min={1} className="h-8 w-24" value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
          {k !== "min_replies" && (
            <Button size="sm" variant="ghost" onClick={() => setVals({ ...vals, [k]: "" })}>✕</Button>
          )}
        </div>
      ))}
      <Button size="sm" disabled={busy} onClick={save}>{t("common.save")}</Button>
    </div>
  );
}

function ChainRefund({ campaignId, busy, setBusy, onDone }: { campaignId: string; busy: boolean; setBusy: (b: boolean) => void; onDone: () => void }) {
  const { t } = useI18n();
  const refundChain = useServerFn(refundChainEscrow);
  const [txHash, setTxHash] = useState("");
  async function submit(hash: string) {
    await refundChain({ data: { campaignId, txHash: hash } });
    toast.success(t("escrow.refunded"));
    onDone();
  }
  async function run() {
    setBusy(true);
    try {
      await submit(txHash.trim());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function runContract() {
    if (!hasEthereum()) { toast.error(t("m.noMetaMask")); return; }
    setBusy(true);
    try {
      const hash = await refundEscrowTx(campaignId);
      await submit(hash);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      {!!chainConfig().escrowAddress && (
        <Button size="sm" variant="outline" className="self-start" disabled={busy} onClick={runContract}>{t("m.escrowRefund")}</Button>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input placeholder={`${t("m.chainRefund")} · tx hash`} value={txHash} onChange={(e) => setTxHash(e.target.value)} />
        <Button size="sm" variant="outline" disabled={busy || !txHash.trim()} onClick={run}>{t("m.chainRefund")}</Button>
      </div>
    </div>
  );
}

function PayoutRow({ p, share, currency, paymentMethod, onDone }: { p: { id: string; winner_handle: string; status: string; proof: string | null; wallet_address?: string | null; stripe_account_id?: string | null; claim_info?: string | null }; share: number | null; currency: string; paymentMethod: string; onDone: () => void }) {
  const { t } = useI18n();
  const record = useServerFn(recordChainPayout);
  const payStripe = useServerFn(payoutViaStripe);
  const [proof, setProof] = useState(p.proof ?? "");
  const [wallet, setWallet] = useState(p.wallet_address ?? (/^0x[0-9a-fA-F]{40}$/.test(p.claim_info ?? "") ? p.claim_info!.trim() : ""));
  const [busy, setBusy] = useState(false);
  const canChainPay = currency === "USDT" && share !== null && share > 0 && p.status !== "paid";
  const canStripePay = paymentMethod === "stripe" && share !== null && share > 0 && p.status !== "paid";

  async function save() {
    const { error } = await supabase.from("payouts").update({ proof, status: proof ? "paid" : "pending", updated_at: new Date().toISOString() }).eq("id", p.id);
    if (error) toast.error(error.message);
    onDone();
  }
  async function payChain() {
    if (!hasEthereum()) { toast.error(t("m.noMetaMask")); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet.trim())) { toast.error(t("m.winnerWallet")); return; }
    setBusy(true);
    try {
      const hash = await sendTokenTransfer(wallet.trim() as `0x${string}`, share!);
      await record({ data: { payoutId: p.id, txHash: hash, walletAddress: wallet.trim() } });
      toast.success(t("r.paid"));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function transferStripe() {
    setBusy(true);
    try {
      await payStripe({ data: { payoutId: p.id } });
      toast.success(t("r.paid"));
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="w-40 font-mono">{p.winner_handle}</span>
        <Input placeholder={t("m.proof")} value={proof} onChange={(e) => setProof(e.target.value)} />
        <Button size="sm" onClick={save}>{p.status === "paid" ? t("common.save") : t("m.markPaid")}</Button>
      </div>
      {p.claim_info && p.status !== "paid" && (
        <p className="break-all text-xs text-muted-foreground">
          {t("m.claimInfo")}: <span className="font-mono text-foreground">{p.claim_info}</span>
        </p>
      )}
      {canChainPay && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input placeholder={t("m.winnerWallet")} value={wallet} onChange={(e) => setWallet(e.target.value)} className="font-mono text-xs" />
          <Button size="sm" variant="secondary" disabled={busy} onClick={payChain}>
            {t("m.payOnchain")}{share !== null ? ` · ${share.toFixed(2)} USDT` : ""}
          </Button>
        </div>
      )}
      {canStripePay && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {p.stripe_account_id ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={transferStripe}>
              {t("m.payStripe")}{share !== null ? ` · ${share.toFixed(2)} ${currency}` : ""}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">{t("m.awaitingClaim")}</p>
          )}
        </div>
      )}
    </div>
  );
}
