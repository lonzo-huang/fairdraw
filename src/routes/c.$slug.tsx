import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { translate, useI18n } from "@/lib/i18n";
import { computeProgress, parseConditions, type ConditionCheck, type Metrics } from "@/lib/conditions";
import { useAuth } from "@/hooks/use-auth";
import { getCampaignShare } from "@/lib/campaign-share.functions";
import { conditionSummary, prizeSummary } from "@/lib/campaign-share";
import { fetchAllSnaps } from "@/lib/campaign-hub";
import { Activity, ArrowUpRight, BadgeCheck, BarChart3, Eye, Heart, Link2, MessageCircle, MessageSquare, Percent, Repeat2, Search, UserPlus, Users } from "lucide-react";

export const Route = createFileRoute("/c/$slug")({
  loader: ({ params }) => getCampaignShare({ data: { slug: params.slug } }),
  head: ({ loaderData }) => {
    const c = loaderData?.c;
    const title = c ? `${c.title} — FairDraw` : "Giveaway — FairDraw";
    const description = c ? `${prizeSummary(c)}。${conditionSummary(c)}` : "Enter this verifiable giveaway on FairDraw.";
    const image = loaderData?.imageUrl;
    return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...(image?.startsWith("https://") ? [{ property: "og:image", content: image }, { name: "twitter:image", content: image }, { property: "og:image:width", content: "1200" }, { property: "og:image:height", content: "630" }] : []),
    ],
  }; },
  component: CampaignPage,
});

function useCountdown(end: string | undefined) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  if (!end || now === null) return null;
  const ms = Math.max(0, new Date(end).getTime() - now);
  return { ms, h: Math.floor(ms / 36e5), m: Math.floor((ms / 6e4) % 60), s: Math.floor((ms / 1e3) % 60) };
}

function CampaignPage() {
  const { slug } = Route.useParams();
  const share = Route.useLoaderData();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["campaign", slug],
    // Pool progress is re-displayed every 15 minutes.
    refetchInterval: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: c } = await supabase.from("campaigns").select("*").eq("slug", slug).maybeSingle();
      if (!c) return null;
      const { data: count } = await supabase.rpc("entry_count", { _campaign_id: c.id });
      const [snaps, { data: draw }] = await Promise.all([
        fetchAllSnaps((from, size) => supabase.from("condition_snapshots").select("metrics, progress, fetched_at").eq("campaign_id", c.id).order("fetched_at", { ascending: true }).range(from, from + size - 1)),
        supabase.from("draws").select("drawn_at").eq("campaign_id", c.id).maybeSingle(),
      ]);
      return { c, count: count ?? 0, snaps, drawAt: draw?.drawn_at ?? null };
    },
  });
  const cd = useCountdown(data?.c?.ends_at);
  const [tab, setTab] = useState<"overview" | "engagement" | "impact">("overview");

  if (isLoading) return <p className="p-10 text-center text-muted-foreground">{t("common.loading")}</p>;
  if (!data) return <p className="p-10 text-center text-muted-foreground">404</p>;
  const { c, count, snaps, drawAt } = data;
  const latestSnap = snaps[snaps.length - 1] ?? null;
  const latestM = asMetrics(latestSnap?.metrics);
  // Baseline = the earliest snapshot that actually captured followers; older rows never had the field.
  const firstM = asMetrics(snaps.find((s) => typeof asMetrics(s.metrics)?.followers === "number")?.metrics);
  const open = c.status === "open";
  const drawn = c.status === "drawn";
  const closed = !open || (cd ? cd.ms === 0 : false);
  const linked = !!c.tweet_url;
  const isOwner = !!user && user.id === c.owner_id;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = `${origin}/c/${c.slug}`;
  const conditions = parseConditions(c.conditions);
  const hasConds = Object.values(conditions).some((v) => v !== undefined);
  const prog = hasConds ? computeProgress(conditions, { ...(latestM ?? {}), participants: count } as Metrics) : null;
  const condTotal = prog?.checks.length ?? 0;
  const met = prog?.checks.filter((ch) => ch.state === "met").length ?? 0;
  const allMet = condTotal > 0 && met === condTotal;
  const pastDeadline = Date.parse(c.ends_at) < Date.now();
  const amt = c.prize_amount !== null ? `${c.prize_amount} ${c.currency}` : c.prize;
  const durH = Math.max(1, Math.round((Date.parse(c.ends_at) - Date.parse(c.created_at)) / 3600e3));
  const badge: [string, string] = c.status === "cancelled" ? ["b-end", t("status.cancelled")]
    : drawn ? ["b-done", t("status.drawn")]
    : open && !linked ? ["b-wait", t("m.badgeLink")]
    : closed ? ["b-end", t("m.ended")]
    : ["b-live", t("status.open")];
  const titleKey = drawn ? "ana.titleDrawn" : hasConds ? "ana.titleMet" : "ana.titlePlain";
  const growth = netGrowth(latestM, firstM);
  // First snapshot where any condition was already met.
  const firstMetSnap = hasConds ? snaps.find((sp) => {
    const m = asMetrics(sp.metrics);
    return m ? computeProgress(conditions, { ...m, participants: count } as Metrics).checks.some((ch) => ch.state === "met") : false;
  }) : undefined;
  const tlItems: { st: "done" | "now" | ""; t: string; s: string }[] = [
    { st: "done", t: t("ev.created"), s: new Date(c.created_at).toLocaleString() },
  ];
  if (snaps.length) tlItems.push({ st: "done", t: t("ev.synced"), s: new Date(snaps[0]?.fetched_at ?? "").toLocaleString() });
  if (firstMetSnap) tlItems.push({ st: "done", t: t("ev.firstMet"), s: new Date(firstMetSnap.fetched_at).toLocaleString() });
  if (open && linked && !pastDeadline) tlItems.push({ st: "now", t: allMet ? t("ev.ready") : t("ev.wait"), s: t("ev.running") });
  tlItems.push({ st: pastDeadline || drawn ? "done" : "", t: t("ev.deadline"), s: new Date(c.ends_at).toLocaleString() });
  if (drawn && drawAt) tlItems.push({ st: "done", t: t("ev.drawn"), s: new Date(drawAt).toLocaleString() });
  else if (c.status === "cancelled") tlItems.push({ st: "", t: t("status.cancelled"), s: "" });
  else tlItems.push({ st: "", t: t("ev.drawSoon"), s: t("ev.drawWhen") });
  const copyShare = () => { navigator.clipboard.writeText(shareUrl).catch(() => {}); toast.success(t("c.copied")); };

  return (
    <div className="page-ana mx-auto max-w-[1200px] px-4 pb-20 pt-9 md:px-6">
      <div className="crumb">
        {isOwner ? <Link to="/dashboard">{t("dash.title")}</Link> : <Link to="/">FairDraw</Link>}
        <span>/</span><span>{t("cy.details")}</span>
      </div>

      <div className="top">
        <div>
          <span className={`badge ${badge[0]}`}>{badge[1]}</span>
          <h1 className="title">{translate(lang, titleKey, { n: met, amt: "" })}<span className="amt">{amt}</span></h1>
          <div className="conds">
            {COND_CHIPS.filter(({ k }) => conditions[k] !== undefined).map(({ k, I }) => (
              <span key={k} className="cchip"><I />{k === "keyword" ? `${t("cond.keyword")} · ${conditions.keyword}` : `${t(COND_LABEL[k])} ≥ ${conditions[k]}`}</span>
            ))}
          </div>
          {c.description && <p className="desc">{c.description}</p>}
          {linked ? (
            <a className="tweet" href={c.tweet_url ?? undefined} target="_blank" rel="noopener noreferrer">
              <span className="av">{(latestM?.author_name ?? latestM?.author_handle ?? "𝕏").slice(0, 3).toUpperCase()}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="n"><b>{latestM?.author_name ?? "—"}</b><span>{latestM?.author_handle ? `@${latestM.author_handle}` : ""}</span><ArrowUpRight /></div>
                <div className="t">{latestM?.text ?? c.tweet_url}</div>
              </div>
            </a>
          ) : (
            <div className="tweet-empty">
              <Link2 />
              <div><b>{t("ana.noTweetT")}</b><span>{t("ana.noTweetS")}</span></div>
              {isOwner && <Link to="/manage/$id" params={{ id: c.id }} className="abtn">{t("ana.goLink")}</Link>}
            </div>
          )}
          {c.requirement && (
            <div className="panel" style={{ padding: "14px 18px", marginTop: 14 }}>
              <p className="t-lab">{t("f.req")}</p>
              <p className="desc" style={{ marginTop: 4, marginBottom: 0 }}>{c.requirement}</p>
            </div>
          )}
          {c.target_url && (
            <a href={`/go/${c.slug}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#9aa4b8", marginTop: 12, textDecoration: "none" }}>
              <ArrowUpRight style={{ width: 14, height: 14 }} />{t("c.visit")}
            </a>
          )}
        </div>

        <div className="ticket">
          <div className="ticket-in">
            <div className="t-top">
              <div className="t-lab">{t("cy.total")}</div>
              <div className="t-amt">{c.prize_amount ?? c.prize}{c.prize_amount !== null && <small>{c.currency}</small>}</div>
              <div className="t-sub">{c.winners_count} {t("dash.winners")} · {t(`escrow.${c.escrow_status}` as "escrow.funded")}</div>
            </div>
            <div className="perf" aria-hidden="true" />
            <div className="t-bot">
              {open && linked && !closed && cd ? (
                <div>
                  <div className="t-lab" style={{ marginBottom: 6 }}>{t("m.timeLeft")}</div>
                  <div className="cd">
                    <div><b>{pad2(cd.h)}</b><span>{t("m.hUnit")}</span></div>
                    <div><b>{pad2(cd.m)}</b><span>{t("m.mUnit")}</span></div>
                    <div><b>{pad2(cd.s)}</b><span>{t("m.sUnit")}</span></div>
                  </div>
                </div>
              ) : (
                <div className="cd-wait">
                  <b>{!linked ? translate(lang, "m.hours", { h: durH }) : drawn ? t("status.drawn") : t("m.ended")}</b>
                  {!linked ? t("ana.timerWait") : new Date(c.ends_at).toLocaleDateString()}
                </div>
              )}
              <div className="t-row"><span>{t("c.participants")}</span><b>{linked ? count : "—"}</b></div>
              {drawn && <Link to="/r/$slug" params={{ slug }} className="abtn" style={{ justifyContent: "center" }}>{t("c.result")}</Link>}
              <button type="button" className="ghost" onClick={copyShare}><Link2 />{t("m.copyLink")}</button>
            </div>
          </div>
        </div>
      </div>

      <div className={`sync${linked ? "" : " off"}`}>
        <span>{linked ? `${t("ana.syncNote")}${latestSnap ? ` · ${t("ana.lastUpdated")} ${new Date(latestSnap.fetched_at).toLocaleString()}` : ""}` : t("ana.noSync")}</span>
      </div>
      <StatsRow snaps={snaps} latestM={latestM} firstM={firstM} linked={linked} />

      {linked ? (
        <>
          <div className="tabs" role="tablist">
            {(["overview", "engagement", "impact"] as const).map((tb) => (
              <button key={tb} role="tab" aria-selected={tab === tb} onClick={() => setTab(tb)}>{t(`ana.${tb}`)}</button>
            ))}
          </div>

          {tab === "overview" && (
            <>
              <div className="g2">
                <section className="panel card">
                  <div className="card-h">
                    <div><h3>{t("ana.condTitle")}</h3><p>{t("ana.condSub")}</p></div>
                    <div className="ov-pct">{hasConds ? `${prog?.progress ?? 0}%` : "—"}{hasConds && <small>{translate(lang, "ana.metCount", { a: met, b: condTotal })}</small>}</div>
                  </div>
                  <CondRows checks={prog?.checks ?? []} live={open} />
                </section>
                <section className="panel card">
                  <div className="card-h"><div><h3>{t("ana.timeline")}</h3></div></div>
                  <TimelineList items={tlItems} />
                </section>
              </div>
              <section className="panel card" style={{ marginTop: 16 }}>
                <div className="card-h">
                  <div><h3>{t("ana.chartTitle")}</h3><p>{t("ana.chartSub")}</p></div>
                  <div className="legend">
                    {DELTA_SERIES.map((s) => <span key={s.key} style={{ "--c": s.color } as CSSProperties}>{t(s.label)}</span>)}
                  </div>
                </div>
                <DeltaChart snaps={snaps} />
              </section>
            </>
          )}

          {tab === "engagement" && (
            <>
              <div className="g2">
                <section className="panel card">
                  <div className="card-h"><div><h3>{t("ana.breakdown")}</h3><p>{t("ana.mixSub")}</p></div></div>
                  <MixBreakdown metrics={latestM} />
                </section>
                <section className="panel card">
                  <div className="card-h"><div><h3>{t("ana.qualTitle")}</h3><p>{t("ana.qualSub")}</p></div></div>
                  <QualCard metrics={latestM} count={count} growth={growth} />
                </section>
              </div>
              <section className="panel card" style={{ marginTop: 16 }}>
                <TrendChart snaps={snaps} />
              </section>
            </>
          )}

          {tab === "impact" && (
            <>
              <ValueGrid c={c} latestM={latestM} firstM={firstM} />
              <section className="panel card">
                <div className="card-h"><div><h3>{t("ana.impact")}</h3></div></div>
                <p className="note" style={{ marginTop: 0 }}>{t("ana.valNote")}</p>
              </section>
            </>
          )}
        </>
      ) : (
        <section className="panel empty">
          <div className="ic"><BarChart3 /></div>
          <h3>{t("ana.emptyT")}</h3>
          <p>{t("ana.emptyS")}</p>
          {isOwner && <Link to="/manage/$id" params={{ id: c.id }} className="abtn">{t("ana.goLink")}</Link>}
        </section>
      )}

      {share.imageUrl && <details className="mt-6"><summary className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground">{t("c.sharePreview")}</summary><img src={share.imageUrl} alt={translate(c.share_language === "en" ? "en" : "zh", "share.imageAlt", { title: c.title, prize: c.prize })} width={1200} height={630} className="mt-3 aspect-[1200/630] w-full rounded-lg border border-border object-contain" /></details>}
    </div>
  );
}

const fmtCompact = (v: number) => v.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
type Snap = { metrics: unknown; progress: number; fetched_at: string };
const asMetrics = (m: unknown): Metrics | null => (m ?? null) as Metrics | null;
const pad2 = (n: number) => String(n).padStart(2, "0");

const COND_LABEL = {
  min_likes: "cond.likes", min_replies: "cond.replies", min_reposts: "cond.reposts",
  min_quotes: "cond.quotes", min_views: "cond.views",
  min_participants: "cond.participants", min_verified: "cond.verified",
} as const;
const CHK_ICON: Record<string, typeof Heart> = {
  min_likes: Heart, min_replies: MessageCircle, min_reposts: Repeat2,
  min_quotes: MessageSquare, min_views: Eye,
  min_participants: Users, min_verified: BadgeCheck, keyword: Search,
};
const COND_CHIPS: { k: "min_likes" | "min_replies" | "min_reposts" | "min_quotes" | "min_views" | "min_participants" | "min_verified" | "keyword"; I: typeof Heart }[] = [
  { k: "min_likes", I: Heart }, { k: "min_replies", I: MessageCircle }, { k: "min_reposts", I: Repeat2 },
  { k: "min_quotes", I: MessageSquare }, { k: "min_views", I: Eye },
  { k: "min_participants", I: Users }, { k: "min_verified", I: BadgeCheck }, { k: "keyword", I: Search },
];

/** Engagement total: sums only the metrics that were actually read; null when none are. */
function totalEngagements(m: Metrics | null): number | null {
  if (!m) return null;
  const vals = [m.likes, m.replies, m.reposts, m.quotes, m.bookmarks].filter((v): v is number => typeof v === "number");
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}

function engagementRate(m: Metrics | null): number | null {
  const e = totalEngagements(m);
  return e !== null && typeof m?.views === "number" && m.views > 0 ? (e / m.views) * 100 : null;
}

function netGrowth(m: Metrics | null, fm: Metrics | null): number | null {
  return typeof m?.followers === "number" && typeof fm?.followers === "number" ? Math.max(0, m.followers - fm.followers) : null;
}

/** Four headline KPI cards — real snapshot values only; "获取中" marks fields the sweep is still retrying. */
function StatsRow({ snaps, latestM, firstM, linked, open }: { snaps: Snap[]; latestM: Metrics | null; firstM: Metrics | null; linked: boolean; open: boolean }) {
  const { t, lang } = useI18n();
  const prevM = asMetrics(snaps[snaps.length - 2]?.metrics);
  const engagements = totalEngagements(latestM);
  const prevEng = totalEngagements(prevM);
  const rate = engagementRate(latestM);
  const growth = netGrowth(latestM, firstM);
  const viewDelta = typeof latestM?.views === "number" && typeof prevM?.views === "number" ? Math.max(0, latestM.views - prevM.views) : null;
  const engDelta = engagements !== null && prevEng !== null ? Math.max(0, engagements - prevEng) : null;
  // Cumulative sparkline across snapshots for the first two cards.
  const sparkFor = (key: "views" | "eng") => {
    const pts = snaps.map((sp) => {
      const m = asMetrics(sp.metrics);
      return key === "views" ? m?.views : m ? totalEngagements(m) : null;
    }).filter((v): v is number => typeof v === "number");
    if (pts.length < 2) return null;
    const mx = Math.max(1, ...pts);
    return pts.map((v, j) => `${(j / (pts.length - 1)) * 72},${22 - (v / mx) * 20}`).join(" ");
  };
  const live = linked && latestM !== null;
  const cards: { l: string; I: typeof Eye; bg: string; col: string; v: string | null; note: string; spark?: string | null; vCol?: string }[] = [
    { l: t("cy.exposure"), I: Eye, bg: "rgba(56,189,248,.12)", col: "#38bdf8",
      v: live && typeof latestM?.views === "number" ? fmtCompact(latestM.views) : null,
      note: viewDelta !== null ? translate(lang, "ana.statDelta", { n: viewDelta }) : t("ana.postLevel"), spark: sparkFor("views") },
    { l: t("ana.engagements"), I: Activity, bg: "rgba(124,92,255,.14)", col: "#a99bff",
      v: live && engagements !== null ? fmtCompact(engagements) : null,
      note: engDelta !== null ? translate(lang, "ana.statDelta", { n: engDelta }) : t("ana.postLevel"), spark: sparkFor("eng") },
    { l: t("ana.engRate"), I: Percent, bg: "rgba(245,184,61,.12)", col: "#f5b83d",
      v: live && rate !== null ? `${rate.toFixed(2)}%` : null, note: t("ana.engRateNote") },
    { l: t("stat.newFollowers"), I: UserPlus, bg: "rgba(52,211,153,.12)", col: "#34d399",
      v: live && growth !== null ? `+${fmtCompact(growth)}` : null, note: t("ana.accountLevel"), vCol: "#34d399" },
  ];
  return (
    <div className="stats">
      {cards.map((cd2) => (
        <div key={cd2.l} className="panel stat">
          <div className="stat-h">{cd2.l}<span className="stat-ic" style={{ background: cd2.bg, color: cd2.col }}><cd2.I /></span></div>
          <div className={`stat-v${cd2.v === null ? " empty" : ""}`} style={cd2.vCol && cd2.v !== null ? { color: cd2.vCol } : undefined}>{cd2.v ?? (open && linked ? <span className="pend">{t("ana.pending")}</span> : "—")}</div>
          <div className="stat-f">
            <span>{cd2.v === null ? (open && linked ? t("ana.pendingSub") : t("ana.statWait")) : cd2.note}</span>
            {cd2.v !== null && cd2.spark && (
              <svg className="spark" viewBox="0 0 72 24" preserveAspectRatio="none">
                <polyline fill="none" stroke={cd2.col} strokeWidth="1.8" strokeLinecap="round" vectorEffect="non-scaling-stroke" points={cd2.spark} />
              </svg>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Condition rows in the mockup style: icon, label, now/goal, status tag, progress bar. */
function CondRows({ checks, live }: { checks: ConditionCheck[]; live: boolean }) {
  const { t, lang } = useI18n();
  if (!checks.length) return <p className="note" style={{ marginTop: 0 }}>{t("cond.none")}</p>;
  return (
    <div>
      {checks.map((ch) => {
        const I = CHK_ICON[ch.key] ?? Activity;
        const met = ch.state === "met";
        const numeric = typeof ch.target === "number" && typeof ch.current === "number";
        const w = numeric ? Math.min(100, Math.round((Number(ch.current) / Number(ch.target)) * 100)) : met ? 100 : 0;
        const st = met ? "ok" : ch.state === "unmet" && numeric ? "go" : "wait";
        return (
          <div key={ch.key} className="cr">
            <div className="cr-h">
              <span className="ic"><I /></span>
              <span className="nm">{t(`cond.${ch.label}` as "cond.likes")}</span>
              <span className="val">{numeric ? ch.current : "—"}<small> / {ch.target}</small></span>
              <span className={`st ${st}`}>
                {met ? t("cond.met") : st === "go" ? translate(lang, "ana.metLeft", { n: Math.max(0, Number(ch.target) - Number(ch.current)) }) : live ? t("ana.pending") : t("cond.unknown")}
              </span>
            </div>
            <div className="cbar"><i className={met ? "ok" : ""} style={{ width: `${w}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

/** Vertical timeline: done (green) / now (blue ring) / pending (muted). */
function TimelineList({ items }: { items: { st: "done" | "now" | ""; t: string; s: string }[] }) {
  return (
    <ul className="tl">
      {items.map((it, i) => (
        <li key={i} className={it.st}><span className="dot" /><div><div className="t">{it.t}</div><div className="s">{it.s}</div></div></li>
      ))}
    </ul>
  );
}

const MIX_KEYS = [
  { key: "likes" as const, label: "cond.likes" as const, c: "#f472b6" },
  { key: "replies" as const, label: "cond.replies" as const, c: "#3b82f6" },
  { key: "reposts" as const, label: "cond.reposts" as const, c: "#34d399" },
  { key: "quotes" as const, label: "cond.quotes" as const, c: "#f5b83d" },
  { key: "bookmarks" as const, label: "stat.bookmarks" as const, c: "#38bdf8" },
];

/** Engagement mix: segmented bar + per-type legend; unreadable metrics are omitted, never zeroed. */
function MixBreakdown({ metrics }: { metrics: Metrics | null }) {
  const { t } = useI18n();
  const rows = MIX_KEYS.map((m) => ({ ...m, v: metrics?.[m.key] })).filter((r): r is typeof r & { v: number } => typeof r.v === "number");
  if (!rows.length) return <p className="note" style={{ marginTop: 0 }}>{t("ana.noSeries")}</p>;
  const total = rows.reduce((s, r) => s + r.v, 0) || 1;
  return (
    <>
      <div className="mixbar">
        {rows.map((r) => <i key={r.key} style={{ flexGrow: r.v, background: r.c }} title={`${t(r.label)} ${r.v}`} />)}
      </div>
      <div className="mixl">
        {rows.map((r) => (
          <div key={r.key} style={{ "--c": r.c } as CSSProperties}>
            {t(r.label)}<b>{r.v.toLocaleString()}</b><small>{Math.round((r.v / total) * 100)}%</small>
          </div>
        ))}
      </div>
    </>
  );
}

/** Entry quality tiles — computed from snapshot participant counts and snapshot-delta followers. */
function QualCard({ metrics, count, growth }: { metrics: Metrics | null; count: number; growth: number | null }) {
  const { t } = useI18n();
  const participants = typeof metrics?.participants === "number" ? metrics.participants : null;
  const valid = participants !== null && participants > 0 ? Math.min(100, Math.round((count / participants) * 100)) : null;
  const blue = participants !== null && participants > 0 && typeof metrics?.verified === "number"
    ? Math.round((metrics.verified / participants) * 100) : null;
  const tiles = [
    { v: valid !== null ? `${valid}%` : "—", l: t("ana.qValid"), col: "#34d399" },
    { v: blue !== null ? `${blue}%` : "—", l: t("ana.qBlue"), col: undefined as string | undefined },
    { v: growth !== null ? `+${growth.toLocaleString()}` : "—", l: t("stat.newFollowers"), col: undefined as string | undefined },
  ];
  return (
    <>
      <div className="qual">
        {tiles.map((q) => (
          <div key={q.l} className="q"><b style={q.col ? { color: q.col } : undefined}>{q.v}</b><span>{q.l}</span></div>
        ))}
      </div>
      <p className="note">{t("ana.qualNote")}</p>
    </>
  );
}

const TREND_SERIES = [
  { key: "likes", label: "cond.likes", color: "#f472b6" },
  { key: "replies", label: "cond.replies", color: "#38bdf8" },
  { key: "reposts", label: "cond.reposts", color: "#a99bff" },
] as const;

const DELTA_SERIES = [
  { key: "likes" as const, label: "cond.likes" as const, color: "#f472b6" },
  { key: "replies" as const, label: "cond.replies" as const, color: "#3b82f6" },
  { key: "reposts" as const, label: "cond.reposts" as const, color: "#34d399" },
  { key: "quotes" as const, label: "cond.quotes" as const, color: "#f5b83d" },
];

/** Stacked bars of engagement gained between consecutive snapshots — real deltas only. */
function DeltaChart({ snaps }: { snaps: Snap[] }) {
  const { t, lang } = useI18n();
  const [hi, setHi] = useState<number | null>(null);
  const W = 640, H = 220, L = 34, R = 6, T = 8, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const deltas = snaps.slice(1).map((sp, i) => {
    const cur = asMetrics(sp.metrics), prev = asMetrics(snaps[i]?.metrics);
    return {
      at: sp.fetched_at,
      vals: DELTA_SERIES.map((s) => {
        const a = cur?.[s.key], b = prev?.[s.key];
        return typeof a === "number" && typeof b === "number" ? Math.max(0, a - b) : 0;
      }),
    };
  }).filter((d) => d.vals.some((v) => v > 0));
  if (!deltas.length) return <p className="note" style={{ marginTop: 0 }}>{t("ana.noSeries")}</p>;
  const totals = deltas.map((d) => d.vals.reduce((x, y) => x + y, 0));
  const mx = Math.max(1, ...totals);
  const n = deltas.length;
  const bw = (iw / n) * 0.62;
  const x = (i: number) => L + (i + 0.5) * (iw / n);
  const step = Math.max(1, Math.ceil(n / 8));
  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${W} ${H}`} onMouseLeave={() => setHi(null)}>
        {[0, 0.5, 1].map((f) => {
          const yy = T + ih - f * ih;
          return (
            <g key={f}>
              <line x1={L} x2={W - R} y1={yy} y2={yy} stroke="rgba(255,255,255,.06)" strokeDasharray={f ? "3 4" : undefined} />
              <text x={L - 8} y={yy + 4} textAnchor="end" fill="#646f85" fontSize="11" fontFamily="Bricolage Grotesque">{Math.round(mx * f)}</text>
            </g>
          );
        })}
        {deltas.map((d, i) => {
          let y0 = T + ih;
          return d.vals.map((v, j) => {
            const h = (v / mx) * ih;
            if (h <= 0) return null;
            y0 -= h;
            const el = <rect key={`${i}-${j}`} x={x(i) - bw / 2} y={y0} width={bw} height={h} fill={DELTA_SERIES[j]?.color} opacity={hi === null || hi === i ? 1 : 0.35} />;
            y0 -= h > 1 ? 1 : 0;
            return el;
          });
        })}
        {deltas.map((_, i) => (i % step === 0 || i === n - 1) ? (
          <text key={`t${i}`} x={x(i)} y={H - 6} textAnchor="middle" fill="#646f85" fontSize="11" fontFamily="Bricolage Grotesque">{i + 1}</text>
        ) : null)}
        <rect x={L} y={T} width={iw} height={ih} fill="transparent"
          onMouseMove={(e) => {
            const rc = e.currentTarget.getBoundingClientRect();
            const rel = ((e.clientX - rc.left) / rc.width) * iw;
            setHi(Math.min(n - 1, Math.max(0, Math.floor(rel / (iw / n)))));
          }} />
      </svg>
      <div className="tip" style={{
        opacity: hi === null ? 0 : 1,
        left: hi === null ? 0 : `clamp(70px, ${(x(hi) / W) * 100}%, calc(100% - 70px))`,
        top: hi === null ? 0 : `${((T + ih - (totals[hi] ?? 0) / mx * ih) / H) * 100}%`,
      }}>
        {hi !== null && (
          <>
            <b>{translate(lang, "ana.chartTip", { n: totals[hi] ?? 0 })}</b>
            <span>{translate(lang, "ana.chartSync", { n: hi + 2 })} · {new Date(deltas[hi]?.at ?? "").toLocaleString()}</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Real cumulative snapshot series — no interpolation, no fabricated history. */
function TrendChart({ snaps }: { snaps: Snap[] }) {
  const { t } = useI18n();
  const W = 640, H = 220, PL = 32, PR = 12, PT = 16, PB = 30;
  const series = TREND_SERIES.map((s) => ({
    ...s,
    pts: snaps.map((sp, i) => {
      const v = asMetrics(sp.metrics)?.[s.key];
      return typeof v === "number" ? { i, v, at: sp.fetched_at } : null;
    }).filter((p): p is { i: number; v: number; at: string } => p !== null),
  })).filter((s) => s.pts.length >= 2);
  return (
    <>
      <div className="card-h">
        <div><h3>{t("ana.trend")}</h3><p>{t("ana.accountLevel")}</p></div>
        {series.length > 0 && (
          <div className="legend">
            {series.map((s) => <span key={s.key} style={{ "--c": s.color } as CSSProperties}>{t(s.label)}</span>)}
          </div>
        )}
      </div>
      {snaps.length < 2 || !series.length ? (
        <p className="note" style={{ marginTop: 0 }}>{t("ana.noSeries")}</p>
      ) : (
        <div className="chart-box">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("ana.trend")}>
            {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={PL} x2={W - PR} y1={PT + (1 - f) * (H - PT - PB)} y2={PT + (1 - f) * (H - PT - PB)} stroke="currentColor" strokeOpacity="0.08" />)}
            {(() => {
              const n = snaps.length;
              const max = Math.max(1, ...series.flatMap((s) => s.pts.map((p) => p.v)));
              const x = (i: number) => PL + (i / Math.max(1, n - 1)) * (W - PL - PR);
              const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
              return (
                <>
                  {series.map((s) => <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={s.pts.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} />)}
                  {series.map((s) => { const last = s.pts[s.pts.length - 1]; return last ? <circle key={`c${s.key}`} cx={x(last.i)} cy={y(last.v)} r="3.5" fill={s.color}><title>{`${t(s.label)} ${last.v.toLocaleString()} · ${new Date(last.at).toLocaleString()}`}</title></circle> : null; })}
                  <text x={PL} y={H - 8} fontSize="10" fill="currentColor" opacity="0.5">{new Date(snaps[0]?.fetched_at ?? "").toLocaleDateString()}</text>
                  <text x={W - PR} y={H - 8} fontSize="10" fill="currentColor" opacity="0.5" textAnchor="end">{new Date(snaps[n - 1]?.fetched_at ?? "").toLocaleDateString()}</text>
                  <text x={PL} y={PT - 6} fontSize="10" fill="currentColor" opacity="0.5">{fmtCompact(max)}</text>
                </>
              );
            })()}
          </svg>
        </div>
      )}
    </>
  );
}

/** Campaign value cards — estimates only computed when the inputs are real. */
function ValueGrid({ c, latestM, firstM }: { c: { prize: string; prize_amount: number | null; currency: string }; latestM: Metrics | null; firstM: Metrics | null }) {
  const { t, lang } = useI18n();
  const prize = typeof c.prize_amount === "number" ? c.prize_amount : null;
  const cur = c.currency;
  const eng = totalEngagements(latestM);
  const views = typeof latestM?.views === "number" ? latestM.views : null;
  const growth = netGrowth(latestM, firstM);
  // Public CPM estimate — labelled as an estimate, never presented as a quote.
  const CPM = 6.5;
  const adValue = views !== null && views > 0 ? (views / 1000) * CPM : null;
  const roi = adValue !== null && prize !== null && prize > 0 ? adValue / prize : null;
  const costEng = prize !== null && eng !== null && eng > 0 ? `${(prize / eng).toFixed(3)} ${cur}` : "—";
  const costFol = prize !== null && growth !== null && growth > 0 ? `${(prize / growth).toFixed(2)} ${cur}` : "—";
  const amt = prize !== null ? `${prize} ${cur}` : c.prize;
  const cards = [
    { l: t("ana.adValue"), v: adValue !== null ? `≈ $${adValue.toFixed(1)}` : "—", c: roi !== null ? translate(lang, "ana.roi", { x: roi.toFixed(1) }) : t("ana.adValueNote"), hl: true },
    { l: t("ana.costEng"), v: costEng, c: translate(lang, "ana.costSub", { amt }), hl: false },
    { l: t("ana.costFollower"), v: costFol, c: growth !== null ? translate(lang, "ana.growthNote", { n: growth }) : t("ana.accountLevel"), hl: false },
  ];
  return (
    <div className="val-g">
      {cards.map((vc) => (
        <div key={vc.l} className={`panel vc${vc.hl ? " hl" : ""}`}>
          <div className="l">{vc.l}</div>
          <div className="v">{vc.v}</div>
          <div className="c"><b>{vc.c}</b></div>
        </div>
      ))}
    </div>
  );
}
