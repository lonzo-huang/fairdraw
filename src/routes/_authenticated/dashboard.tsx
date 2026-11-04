import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, ArrowUpRight, Eye, Gift, Search, TrendingUp, Zap } from "lucide-react";
import type { Metrics } from "@/lib/conditions";
import { fetchAllSnaps } from "@/lib/campaign-hub";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard — FairDraw" },
    { name: "description", content: "Manage your FairDraw campaigns." },
    { property: "og:title", content: "Dashboard — FairDraw" },
    { property: "og:description", content: "Manage your FairDraw campaigns." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Dashboard,
});

const fmtCompact = (v: number) => v.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
type SnapRow = { campaign_id: string; metrics: unknown; fetched_at: string };
type Camp = { id: string; slug: string; title: string; prize: string; prize_amount: number | null; currency: string; status: string; ends_at: string; created_at: string; tweet_url: string | null; entries: number };
const asM = (m: unknown): Metrics | null => (m ?? null) as Metrics | null;
const eng = (m: Metrics | null): number | null => {
  if (!m) return null;
  const vals = [m.likes, m.replies, m.reposts, m.quotes, m.bookmarks].filter((v): v is number => typeof v === "number");
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
};
const RANGE_MS: Record<string, number> = { "7": 7 * 864e5, "30": 30 * 864e5, "90": 90 * 864e5, all: Infinity };

function Dashboard() {
  const { t } = useI18n();
  const [range, setRange] = useState<keyof typeof RANGE_MS>("30");
  const [trend, setTrend] = useState<"impressions" | "engagements" | "growth">("impressions");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      const { data: campaigns } = await supabase.from("campaigns").select("*").eq("owner_id", uid).order("created_at", { ascending: false });
      const ids = (campaigns ?? []).map((c) => c.id);
      const counts = await Promise.all(ids.map(async (id) => (await supabase.rpc("entry_count", { _campaign_id: id })).data ?? 0));
      const snaps = ids.length
        ? await fetchAllSnaps<SnapRow>((from, size) => supabase.from("condition_snapshots").select("campaign_id, metrics, fetched_at").in("campaign_id", ids).order("fetched_at", { ascending: true }).range(from, from + size - 1))
        : [];
      return { campaigns: (campaigns ?? []).map((c, i) => ({ ...c, entries: counts[i] })) as Camp[], snaps };
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <Skeleton className="h-9 w-48" /><Skeleton className="mt-2 h-4 w-72" />
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[130px] rounded-xl" />)}</div>
        <Skeleton className="mt-6 h-[260px] rounded-xl" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-24 text-center">
        <p className="text-muted-foreground">{t("dash.loadError")}</p>
        <Button variant="outline" onClick={() => refetch()}>{t("dash.retry")}</Button>
      </div>
    );
  }

  const { campaigns, snaps } = data;
  const now = Date.now();
  const rangeMs = RANGE_MS[range];
  const inRange = snaps.filter((s) => rangeMs === Infinity || now - Date.parse(s.fetched_at) <= rangeMs);
  const snapsByCamp = new Map<string, SnapRow[]>();
  for (const s of snaps) (snapsByCamp.get(s.campaign_id) ?? snapsByCamp.set(s.campaign_id, []).get(s.campaign_id)!).push(s);

  // ---- KPI: per-campaign snapshot deltas inside the selected range ----
  const inRangeByCamp = new Map<string, SnapRow[]>();
  for (const s of inRange) (inRangeByCamp.get(s.campaign_id) ?? inRangeByCamp.set(s.campaign_id, []).get(s.campaign_id)!).push(s);
  let impDelta: number | null = null;
  let engDelta: number | null = null;
  for (const arr of inRangeByCamp.values()) {
    const f = asM(arr[0].metrics), l = asM(arr[arr.length - 1].metrics);
    if (typeof f?.views === "number" && typeof l?.views === "number") impDelta = (impDelta ?? 0) + Math.max(0, l.views - f.views);
    const fe = eng(f), le = eng(l);
    if (fe !== null && le !== null) engDelta = (engDelta ?? 0) + Math.max(0, le - fe);
  }
  // Account growth: group by X handle so parallel campaigns never double-count the same account.
  const byHandle = new Map<string, number[]>();
  for (const s of inRange) {
    const m = asM(s.metrics);
    if (typeof m?.followers !== "number") continue;
    const h = m.author_handle ?? s.campaign_id;
    (byHandle.get(h) ?? byHandle.set(h, []).get(h)!).push(m.followers);
  }
  let growth: number | null = null;
  for (const v of byHandle.values()) if (v.length >= 1) growth = (growth ?? 0) + Math.max(0, v[v.length - 1] - v[0]);
  const live = campaigns.filter((c) => c.status === "open" && Date.parse(c.ends_at) > now).length;

  // ---- Aggregate cumulative trend over range ----
  const trendPts = buildSeries(inRange, trend);

  // ---- Portfolio table state ----
  const rank = (c: Camp) => (c.status === "open" && Date.parse(c.ends_at) > now ? 0 : c.status === "open" ? 1 : c.status === "drawn" ? 2 : 3);
  const statusKey = (c: Camp) => (c.status === "drawn" ? "drawn" : c.status === "cancelled" ? "cancelled" : Date.parse(c.ends_at) < now ? "ended" : "live");
  const rows = campaigns
    .map((c) => {
      const arr = snapsByCamp.get(c.id) ?? [];
      const latestM = asM(arr[arr.length - 1]?.metrics);
      const firstF = asM(arr.find((s) => typeof asM(s.metrics)?.followers === "number")?.metrics);
      return { c, latestM, growth: typeof latestM?.followers === "number" && typeof firstF?.followers === "number" ? Math.max(0, latestM.followers - firstF.followers) : null, engagements: eng(latestM) };
    })
    .filter((r) => (status === "all" || statusKey(r.c) === status) && (!search || r.c.title.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => rank(a.c) - rank(b.c) || Date.parse(b.c.created_at) - Date.parse(a.c.created_at));

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute -top-24 left-0 h-72 w-[42rem] bg-[radial-gradient(ellipse_at_top_left,rgba(24,235,165,0.07),transparent_65%)]" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">{t("dash.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("dash.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as keyof typeof RANGE_MS)}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["7", "30", "90", "all"] as const).map((r) => <SelectItem key={r} value={r}>{t(`range.${r}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button asChild><Link to="/new">{t("dash.new")}</Link></Button>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 rounded-xl border border-dashed border-border py-14 text-center">
          <Zap className="size-6 text-prize" />
          <p className="font-medium">{t("dash.emptyTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("dash.emptyDesc")}</p>
          <Button asChild variant="neon"><Link to="/new">{t("dash.emptyCta")}</Link></Button>
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard icon={Eye} accent="text-prize" label={t("kpi.impressions")} value={impDelta === null ? "—" : fmtCompact(impDelta)} note={impDelta === null ? t("kpi.noData") : t("kpi.scope")} />
            <KpiCard icon={Activity} accent="text-sky-400" label={t("kpi.engagements")} value={engDelta === null ? "—" : fmtCompact(engDelta)} note={engDelta === null ? t("kpi.noData") : t("kpi.scope")} />
            <KpiCard icon={TrendingUp} accent="text-violet-400" label={t("kpi.growth")} value={growth === null ? "—" : `+${fmtCompact(growth)}`} note={growth === null ? t("kpi.noData") : t("kpi.growthNote")} />
            <KpiCard icon={Gift} accent="text-foreground" label={t("kpi.giveaways")} value={String(campaigns.length)} note={`${live} ${t("kpi.live")}`} />
          </div>

          <div className="mt-6 rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">{t("trend.title")}</p>
              <div className="flex gap-1">
                {(["impressions", "engagements", "growth"] as const).map((k) => (
                  <button key={k} onClick={() => setTrend(k)} className={`rounded-full px-3 py-1 text-xs transition-colors ${trend === k ? "bg-primary/15 text-prize" : "text-muted-foreground hover:text-foreground"}`}>{t(`trend.${k}`)}</button>
                ))}
              </div>
            </div>
            {trendPts.length >= 2 ? <TrendChart pts={trendPts} color={trend === "impressions" ? "#18EBA5" : trend === "engagements" ? "#38BDF8" : "#B18CFF"} /> : <p className="mt-6 text-sm text-muted-foreground">{t("trend.none")}</p>}
            <p className="mt-2 text-[10px] text-muted-foreground/70">{t("trend.caption")}</p>
          </div>

          <div className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{t("tbl.title")}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{t("tbl.subtitle")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("tbl.search")} className="h-9 w-44 pl-8" />
                </div>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("tbl.allStatus")}</SelectItem>
                    <SelectItem value="live">{t("status.open")}</SelectItem>
                    <SelectItem value="ended">{t("status.ended")}</SelectItem>
                    <SelectItem value="drawn">{t("status.drawn")}</SelectItem>
                    <SelectItem value="cancelled">{t("status.cancelled")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">{t("tbl.noMatch")}</p>
            ) : (
              <>
                <div className="mt-4 hidden overflow-x-auto rounded-xl border border-border md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                        <th className="px-4 py-3 font-medium">{t("tbl.campaign")}</th>
                        <th className="px-4 py-3 font-medium">{t("tbl.status")}</th>
                        <th className="px-4 py-3 text-right font-medium">{t("tbl.impressions")}</th>
                        <th className="px-4 py-3 text-right font-medium">{t("tbl.engagements")}</th>
                        <th className="px-4 py-3 text-right font-medium">{t("tbl.growth")}</th>
                        <th className="px-4 py-3 font-medium">{t("tbl.created")}</th>
                        <th className="px-4 py-3 text-right font-medium">{t("tbl.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => <CampRow key={r.c.id} r={r} />)}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 grid gap-3 md:hidden">
                  {rows.map((r) => <CampCard key={r.c.id} r={r} />)}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Cumulative aggregate series: first observation seeds its full value, later ones add deltas. */
function buildSeries(rows: SnapRow[], metric: "impressions" | "engagements" | "growth") {
  const prev = new Map<string, number>();
  let running = 0;
  const pts: { t: string; v: number }[] = [];
  for (const s of rows) {
    const m = asM(s.metrics);
    const gkey = metric === "growth" ? (m?.author_handle ?? s.campaign_id) : s.campaign_id;
    const v = metric === "impressions" ? m?.views ?? null : metric === "growth" ? m?.followers ?? null : eng(m);
    if (v === null || typeof v !== "number") continue;
    const p = prev.get(gkey);
    running += p === undefined ? v : Math.max(0, v - p);
    prev.set(gkey, v);
    pts.push({ t: s.fetched_at, v: running });
  }
  const stride = Math.ceil(pts.length / 150);
  return stride <= 1 ? pts : pts.filter((_, i) => i % stride === 0 || i === pts.length - 1);
}

function KpiCard({ icon: Icon, accent, label, value, note }: { icon: typeof Eye; accent: string; label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_8px_24px_-12px_rgba(24,235,165,0.25)]">
      <div className="flex items-start justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className={`size-4 ${accent}`} />
      </div>
      <p className="mt-2 font-mono text-3xl font-bold tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground/70">{note}</p>
    </div>
  );
}

function TrendChart({ pts, color }: { pts: { t: string; v: number }[]; color: string }) {
  const W = 760, H = 220, PL = 36, PR = 12, PT = 16, PB = 30;
  const max = Math.max(1, ...pts.map((p) => p.v));
  const x = (i: number) => PL + (i / Math.max(1, pts.length - 1)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  // Catmull-Rom -> cubic bezier for a smooth curve through the points.
  const P = pts.map((p, i) => [x(i), y(p.v)]);
  let d = `M ${P[0][0]},${P[0][1]}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    d += ` C ${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  const area = `${d} L ${P[P.length - 1][0]},${H - PB} L ${P[0][0]},${H - PB} Z`;
  const gid = `tg-${color.slice(1)}`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={PL} x2={W - PR} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" strokeOpacity="0.08" />)}
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.v)} r="7" fill="transparent"><title>{`${p.v.toLocaleString()} · ${new Date(p.t).toLocaleString()}`}</title></circle>)}
      <circle cx={x(pts.length - 1)} cy={y(last.v)} r="3.5" fill={color}><title>{`${last.v.toLocaleString()} · ${new Date(last.t).toLocaleString()}`}</title></circle>
      <text x={PL} y={H - 8} fontSize="10" fill="currentColor" opacity="0.5">{new Date(pts[0].t).toLocaleDateString()}</text>
      <text x={W - PR} y={H - 8} fontSize="10" fill="currentColor" opacity="0.5" textAnchor="end">{new Date(last.t).toLocaleDateString()}</text>
      <text x={PL} y={PT - 6} fontSize="10" fill="currentColor" opacity="0.5">{fmtCompact(max)}</text>
    </svg>
  );
}

type Row = { c: Camp; latestM: Metrics | null; growth: number | null; engagements: number | null };

function Avatar({ handle, name }: { handle: string | null; name: string | null }) {
  if (!handle) return <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold ring-1 ring-border">{(name ?? "?").slice(0, 1).toUpperCase()}</span>;
  return <img src={`https://unavatar.io/x/${handle}`} alt="" loading="lazy" className="size-9 shrink-0 rounded-full bg-muted object-cover ring-1 ring-border" onError={(e) => { e.currentTarget.style.display = "none"; }} />;
}

function CampRow({ r }: { r: Row }) {
  const { t } = useI18n();
  const { c, latestM, growth, engagements } = r;
  const handle = latestM?.author_handle ?? null;
  return (
    <tr className="border-b border-border/60 last:border-0 hover:bg-muted/30">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar handle={handle} name={latestM?.author_name ?? c.title} />
          <div className="min-w-0">
            <Link to="/c/$slug" params={{ slug: c.slug }} className="block truncate font-medium hover:text-prize">{c.title}</Link>
            <p className="truncate text-xs text-muted-foreground">{handle ? `@${handle}` : "—"} · {c.prize_amount !== null ? `${c.prize_amount} ${c.currency}` : c.prize}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3"><StatusBadge status={c.status} endsAt={c.ends_at} /></td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">{typeof latestM?.views === "number" ? fmtCompact(latestM.views) : "—"}</td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">{engagements !== null ? fmtCompact(engagements) : "—"}</td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">{growth === null ? "—" : `+${growth.toLocaleString()}`}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs"><Link to="/c/$slug" params={{ slug: c.slug }}>{t("tbl.analytics")}</Link></Button>
          {c.tweet_url && <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs"><a href={c.tweet_url} target="_blank" rel="noreferrer"><ArrowUpRight className="size-3.5" /><span className="sr-only">{t("tbl.openPost")}</span></a></Button>}
          <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs"><Link to="/manage/$id" params={{ id: c.id }}>{t("tbl.manage")}</Link></Button>
        </div>
      </td>
    </tr>
  );
}

function CampCard({ r }: { r: Row }) {
  const { t } = useI18n();
  const { c, latestM, growth, engagements } = r;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/c/$slug" params={{ slug: c.slug }} className="block truncate font-medium">{c.title}</Link>
          <p className="mt-0.5 text-xs text-muted-foreground">{latestM?.author_handle ? `@${latestM.author_handle}` : "—"} · {c.prize_amount !== null ? `${c.prize_amount} ${c.currency}` : c.prize}</p>
        </div>
        <StatusBadge status={c.status} endsAt={c.ends_at} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div><dt className="text-[10px] text-muted-foreground">{t("tbl.impressions")}</dt><dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{typeof latestM?.views === "number" ? fmtCompact(latestM.views) : "—"}</dd></div>
        <div><dt className="text-[10px] text-muted-foreground">{t("tbl.engagements")}</dt><dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{engagements !== null ? fmtCompact(engagements) : "—"}</dd></div>
        <div><dt className="text-[10px] text-muted-foreground">{t("tbl.growth")}</dt><dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{growth === null ? "—" : `+${growth.toLocaleString()}`}</dd></div>
      </dl>
      <div className="mt-3 flex gap-2">
        <Button asChild variant="outline" size="sm" className="h-8 flex-1 text-xs"><Link to="/c/$slug" params={{ slug: c.slug }}>{t("tbl.analytics")}</Link></Button>
        {c.tweet_url && <Button asChild variant="ghost" size="sm" className="h-8 text-xs"><a href={c.tweet_url} target="_blank" rel="noreferrer">{t("tbl.openPost")}</a></Button>}
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs"><Link to="/manage/$id" params={{ id: c.id }}>{t("tbl.manage")}</Link></Button>
      </div>
    </div>
  );
}
