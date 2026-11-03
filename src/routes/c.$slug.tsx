import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { computeProgress, parseConditions, type Metrics } from "@/lib/conditions";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Activity, ArrowUpRight, Clock3, Trophy, Zap } from "lucide-react";
import { getCampaignShare } from "@/lib/campaign-share.functions";
import { conditionSummary, prizeSummary } from "@/lib/campaign-share";
import { translate } from "@/lib/i18n";

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
  const d = Math.floor(ms / 864e5), h = Math.floor((ms / 36e5) % 24), m = Math.floor((ms / 6e4) % 60), s = Math.floor((ms / 1e3) % 60);
  return { ms, text: `${d}d ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` };
}

function CampaignPage() {
  const { slug } = Route.useParams();
  const share = Route.useLoaderData();
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["campaign", slug],
    // Pool progress is re-displayed every 15 minutes.
    refetchInterval: 15 * 60 * 1000,
    queryFn: async () => {
      const { data: c } = await supabase.from("campaigns").select("*").eq("slug", slug).maybeSingle();
      if (!c) return null;
      const { data: count } = await supabase.rpc("entry_count", { _campaign_id: c.id });
      const [{ data: snaps }, { data: draw }] = await Promise.all([
        supabase.from("condition_snapshots").select("metrics, progress, fetched_at").eq("campaign_id", c.id).order("fetched_at", { ascending: true }).limit(500),
        supabase.from("draws").select("drawn_at").eq("campaign_id", c.id).maybeSingle(),
      ]);
      return { c, count: count ?? 0, snaps: snaps ?? [], drawAt: draw?.drawn_at ?? null };
    },
  });
  const cd = useCountdown(data?.c?.ends_at);
  const [tab, setTab] = useState<"overview" | "engagement" | "impact">("overview");

  if (isLoading) return <p className="p-10 text-center text-muted-foreground">{t("common.loading")}</p>;
  if (!data) return <p className="p-10 text-center text-muted-foreground">404</p>;
  const { c, count } = data;
  const snaps = data.snaps;
  const latestSnap = snaps[snaps.length - 1];
  const latestM = asMetrics(latestSnap?.metrics);
  // Baseline = the earliest snapshot that actually captured followers; older rows never had the field.
  const firstM = asMetrics(snaps.find((s) => typeof asMetrics(s.metrics)?.followers === "number")?.metrics);
  const closed = c.status !== "open" || (cd ? cd.ms === 0 : false);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="grid gap-8 md:grid-cols-[1.3fr_1fr]">
      <div>
        <StatusBadge status={c.status} endsAt={c.ends_at} />
        <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">{c.title}</h1>
        {c.description && <p className="mt-4 whitespace-pre-line text-muted-foreground">{c.description}</p>}
        {c.requirement && (
          <div className="mt-6 rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-medium text-muted-foreground">{t("f.req")}</p>
            <p className="mt-2 whitespace-pre-line">{c.requirement}</p>
          </div>
        )}
        {(c.target_url || c.tweet_url) && (
          <div className="mt-6 flex flex-wrap gap-5 text-sm">
            {c.target_url && <a href={`/go/${c.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"><ArrowUpRight className="size-3.5" />{t("c.visit")}</a>}
            {c.tweet_url && <a href={c.tweet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"><span className="font-black">𝕏</span>{t("m.tweetUrl")}</a>}
          </div>
        )}
        <PostPreview metrics={latestM} tweetUrl={c.tweet_url} />
      </div>

      <div className="space-y-5">
        <div className="ticket p-6">
          <p className="text-xs font-medium text-muted-foreground">{t("cy.total")}</p>
          <p className="mt-1 font-display text-3xl font-bold">{c.prize_amount ? `${c.prize_amount} ${c.currency}` : c.prize}</p>
          <p className="mt-1 text-sm opacity-70">{c.winners_count} {t("c.winners")}</p>
          <div className="perforation my-4" />
          <div className="rounded-lg bg-background/60 px-3 py-2.5 text-center">
            <p className="text-[10px] text-muted-foreground">{t("c.countdownLabel")}</p>
            <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums">{cd && !closed ? cd.text : t("c.closed")}</p>
          </div>
          <p className="mt-3 text-center font-mono text-sm"><span className="font-semibold text-prize">{count}</span> {t("c.participants")}</p>
        </div>

        {c.status === "drawn" ? (
          <Button asChild className="w-full"><Link to="/r/$slug" params={{ slug }}>{t("c.result")}</Link></Button>
        ) : closed ? (
          <p className="text-center text-muted-foreground">{t("c.closed")}</p>
        ) : null}
        <Button variant="ghost" className="w-full" onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success(t("c.copied")); }}>
          {t("c.share")}
        </Button>
      </div>
      </div>

      <KpiRow metrics={latestM} firstMetrics={firstM} updatedAt={latestSnap?.fetched_at} />

      <nav className="mt-8 flex gap-1 border-b border-border" aria-label={t("ana.overview")}>
        {(["overview", "engagement", "impact"] as const).map((tb) => (
          <button key={tb} onClick={() => setTab(tb)} className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${tab === tb ? "border-prize font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t(`ana.${tb}`)}
          </button>
        ))}
      </nav>
      <div className="mt-6 space-y-6">
        {tab === "overview" && <>
          <Timeline createdAt={c.created_at} firstSyncAt={snaps[0]?.fetched_at} endsAt={c.ends_at} drawAt={data.drawAt} />
          <ConditionProgress conditionsRaw={c.conditions} participants={count} snap={latestSnap} />
        </>}
        {tab === "engagement" && <>
          <Breakdown metrics={latestM} />
          <TrendChart snaps={snaps} />
        </>}
        {tab === "impact" && <ImpactCard c={c} metrics={latestM} firstMetrics={firstM} count={count} />}
      </div>
      {share.imageUrl && <details className="mt-6"><summary className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground">{t("c.sharePreview")}</summary><img src={share.imageUrl} alt={translate(c.share_language === "en" ? "en" : "zh", "share.imageAlt", { title: c.title, prize: c.prize })} width={1200} height={630} className="mt-3 aspect-[1200/630] w-full rounded-lg border border-border object-contain" /></details>}
    </div>
  );
}

const fmtCompact = (v: number) => v.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
type Snap = { metrics: unknown; progress: number; fetched_at: string };
const asMetrics = (m: unknown): Metrics | null => (m ?? null) as Metrics | null;

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

/** Original X post preview — only shows what snapshots actually captured. */
function PostPreview({ metrics, tweetUrl }: { metrics: Metrics | null; tweetUrl: string | null }) {
  const { t } = useI18n();
  const handle = metrics?.author_handle ?? null;
  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-5">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span className="font-black">𝕏</span>{t("ana.postPreview")}</p>
      {metrics?.post_text || handle ? (
        <div className="mt-3 flex gap-3">
          {handle && <img src={`https://unavatar.io/x/${handle}`} alt="" loading="lazy" className="size-10 shrink-0 rounded-full bg-muted object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
          <div className="min-w-0">
            <p className="text-sm font-semibold">{metrics?.author_name ?? (handle ? `@${handle}` : "—")}{metrics?.author_verified && <span className="ml-1 text-sky-500">✓</span>}</p>
            {handle && <p className="text-xs text-muted-foreground">@{handle}</p>}
            {metrics?.post_text && <p className="mt-2 line-clamp-6 whitespace-pre-line text-sm leading-6">{metrics.post_text}</p>}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">—</p>
      )}
      {tweetUrl && <a href={tweetUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs text-primary hover:underline">{t("ana.viewPost")}<ArrowUpRight className="size-3" /></a>}
    </div>
  );
}

/** Four headline KPIs per the analytics whitepaper; each card states its data scope. */
function KpiRow({ metrics, firstMetrics, updatedAt }: { metrics: Metrics | null; firstMetrics: Metrics | null; updatedAt?: string }) {
  const { t } = useI18n();
  const engagements = totalEngagements(metrics);
  const rate = engagementRate(metrics);
  const growth = netGrowth(metrics, firstMetrics);
  const cells = [
    { label: t("cy.exposure"), value: typeof metrics?.views === "number" ? fmtCompact(metrics.views) : "—", note: t("ana.postLevel") },
    { label: t("ana.engagements"), value: engagements !== null ? fmtCompact(engagements) : "—", note: t("ana.postLevel") },
    { label: t("ana.engRate"), value: rate !== null ? `${rate.toFixed(2)}%` : "—", note: t("ana.engRateNote") },
    { label: t("stat.newFollowers"), value: growth !== null ? `+${fmtCompact(growth)}` : "—", note: t("ana.accountLevel") },
  ];
  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>{t("ana.syncNote")}</span>
        {updatedAt && <span>{t("ana.lastUpdated")} {new Date(updatedAt).toLocaleString()}</span>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] text-muted-foreground">{cell.label}</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{cell.value}</p>
            <p className="mt-1 text-[10px] text-muted-foreground/70">{cell.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal breakdown sorted desc; unreadable metrics are omitted, never zeroed. */
function Breakdown({ metrics }: { metrics: Metrics | null }) {
  const { t } = useI18n();
  const rows = [
    { label: t("cond.likes"), v: metrics?.likes },
    { label: t("cond.replies"), v: metrics?.replies },
    { label: t("cond.reposts"), v: metrics?.reposts },
    { label: t("cond.quotes"), v: metrics?.quotes },
    { label: t("stat.bookmarks"), v: metrics?.bookmarks },
  ].filter((r): r is { label: string; v: number } => typeof r.v === "number").sort((a, b) => b.v - a.v);
  if (!rows.length) return null;
  const total = rows.reduce((s, r) => s + r.v, 0) || 1;
  const max = rows[0].v || 1;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground">{t("ana.breakdown")}</p>
      <ul className="mt-4 space-y-3">
        {rows.map((r) => (
          <li key={r.label} title={`${r.label}: ${r.v.toLocaleString()} (${Math.round((r.v / total) * 100)}%)`}>
            <div className="flex justify-between text-xs"><span>{r.label}</span><span className="font-mono tabular-nums">{r.v.toLocaleString()} · {Math.round((r.v / total) * 100)}%</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(2, (r.v / max) * 100)}%` }} /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TREND_SERIES = [
  { key: "likes", label: "cond.likes", color: "#18EBA5" },
  { key: "replies", label: "cond.replies", color: "#38BDF8" },
  { key: "reposts", label: "cond.reposts", color: "#B18CFF" },
] as const;

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
  if (snaps.length < 2 || !series.length) {
    return <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-medium text-muted-foreground">{t("ana.trend")}</p><p className="mt-4 text-sm text-muted-foreground">{t("ana.noSeries")}</p></div>;
  }
  const n = snaps.length;
  const max = Math.max(1, ...series.flatMap((s) => s.pts.map((p) => p.v)));
  const x = (i: number) => PL + (i / Math.max(1, n - 1)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t("ana.trend")}</p>
        <div className="flex gap-3">{series.map((s) => <span key={s.key} className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="size-2 rounded-full" style={{ background: s.color }} />{t(s.label)}</span>)}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={t("ana.trend")}>
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={PL} x2={W - PR} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" strokeOpacity="0.08" />)}
        {series.map((s) => <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" points={s.pts.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} />)}
        {series.map((s) => { const last = s.pts[s.pts.length - 1]; return <circle key={s.key} cx={x(last.i)} cy={y(last.v)} r="3.5" fill={s.color}><title>{`${t(s.label)} ${last.v.toLocaleString()} · ${new Date(last.at).toLocaleString()}`}</title></circle>; })}
        <text x={PL} y={H - 8} fontSize="10" fill="currentColor" opacity="0.5">{new Date(snaps[0].fetched_at).toLocaleDateString()}</text>
        <text x={W - PR} y={H - 8} fontSize="10" fill="currentColor" opacity="0.5" textAnchor="end">{new Date(snaps[n - 1].fetched_at).toLocaleDateString()}</text>
        <text x={PL} y={PT - 6} fontSize="10" fill="currentColor" opacity="0.5">{fmtCompact(max)}</text>
      </svg>
    </div>
  );
}

/** Campaign milestones from real timestamps only. */
function Timeline({ createdAt, firstSyncAt, endsAt, drawAt }: { createdAt: string; firstSyncAt?: string; endsAt: string; drawAt?: string | null }) {
  const { t } = useI18n();
  const events = [
    { at: createdAt, icon: Zap, label: t("ev.created") },
    firstSyncAt ? { at: firstSyncAt, icon: Activity, label: t("ev.synced") } : null,
    { at: endsAt, icon: Clock3, label: t("ev.deadline") },
    drawAt ? { at: drawAt, icon: Trophy, label: t("ev.drawn") } : null,
  ].filter((e): e is { at: string; icon: typeof Zap; label: string } => e !== null).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground">{t("ana.timeline")}</p>
      <ol className="mt-4 space-y-3">
        {events.map((e, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <e.icon className="size-3.5 shrink-0 text-prize" />
            <span className="flex-1">{e.label}</span>
            <span className="font-mono text-xs text-muted-foreground">{new Date(e.at).toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Cost metrics — computed only when the inputs are real; N/A otherwise. */
function ImpactCard({ c, metrics, firstMetrics, count }: { c: { prize: string; prize_amount: number | null; currency: string }; metrics: Metrics | null; firstMetrics: Metrics | null; count: number }) {
  const { t } = useI18n();
  const prize = typeof c.prize_amount === "number" ? c.prize_amount : null;
  const cur = c.currency;
  const growth = netGrowth(metrics, firstMetrics);
  const rate = engagementRate(metrics);
  const costFollower = prize !== null && growth !== null && growth > 0 ? `${(prize / growth).toFixed(2)} ${cur}` : "—";
  const costImpr = prize !== null && typeof metrics?.views === "number" && metrics.views > 0 ? `${((prize / metrics.views) * 1000).toFixed(3)} ${cur}` : "—";
  const rows = [
    { label: t("ana.prizeValue"), value: prize !== null ? `${prize} ${cur}` : c.prize },
    { label: t("stat.newFollowers"), value: growth !== null ? `+${growth.toLocaleString()}` : "—" },
    { label: t("ana.costFollower"), value: costFollower, note: t("ana.accountLevel") },
    { label: t("ana.costImpr"), value: costImpr, note: t("ana.postLevel") },
    { label: t("ana.engRate"), value: rate !== null ? `${rate.toFixed(2)}%` : "—", note: t("ana.engRateNote") },
    { label: t("c.participants"), value: count.toLocaleString() },
  ];
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-medium text-muted-foreground">{t("ana.impact")}</p>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-[10px] text-muted-foreground">{r.label}</dt>
            <dd className="mt-1 font-mono text-xl font-semibold tabular-nums">{r.value}</dd>
            {"note" in r && r.note && <dd className="mt-0.5 text-[10px] text-muted-foreground/70">{r.note}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Public condition progress bar. Uses the latest snapshot when present, otherwise live counts. */
function ConditionProgress({
  conditionsRaw,
  participants,
  snap,
}: {
  conditionsRaw: unknown;
  participants: number;
  snap: { metrics: unknown; progress: number; fetched_at: string } | null;
}) {
  const { t } = useI18n();
  const conditions = parseConditions(conditionsRaw);
  if (Object.values(conditions).every((v) => v === undefined)) return null;

  const metrics = (snap?.metrics ?? null) as Metrics | null;
  const { checks, progress } = metrics
    ? computeProgress(conditions, { ...metrics, participants })
    : computeProgress(conditions, { likes: null, replies: null, reposts: null, keyword_found: null, participants, verified: 0 });

  const labelFor = (label: string) => t(`cond.${label}` as Parameters<typeof t>[0]);

  return (
    <div className="mt-8 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{t("cond.title")}</p>
        <span className="font-mono text-sm font-semibold">{progress}%</span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>
      <ul className="mt-4 space-y-2">
        {checks.map((ch) => (
          <li key={ch.key} className="flex items-center justify-between text-sm">
            <span>
              {labelFor(ch.label)} <span className="text-muted-foreground">≥ {ch.target}</span>
              {typeof ch.current === "number" && <span className="ml-2 font-mono text-muted-foreground">({ch.current})</span>}
            </span>
            <span className={ch.state === "met" ? "text-success" : ch.state === "unmet" ? "text-muted-foreground" : "text-accent-foreground"}>
              {ch.state === "met" ? `✓ ${t("cond.met")}` : ch.state === "unmet" ? t("cond.unmet") : t("cond.unknown")}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("cond.refresh")}
        {snap && ` · ${new Date(snap.fetched_at).toLocaleString()}`}
      </p>
    </div>
  );
}
