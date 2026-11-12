import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, BarChart3, BadgeCheck, Eye, ExternalLink, Gift, Heart,
  MessageCircle, MessageSquare, MoreHorizontal, Plus, Repeat2, Search, UserPlus, Users, Zap,
} from "lucide-react";
import type { Conditions, Metrics } from "@/lib/conditions";
import { fetchAllSnaps, poolFunded } from "@/lib/campaign-hub";

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

const DAY = 864e5;
type SnapRow = { campaign_id: string; metrics: unknown; fetched_at: string };
type Camp = {
  id: string; slug: string; title: string; prize: string; prize_amount: number | null;
  currency: string; status: string; ends_at: string; created_at: string;
  tweet_url: string | null; conditions: unknown; winners_count: number | null;
  escrow_status: string; payment_method: string;
};
type St = "pay" | "draft" | "live" | "done" | "end";
type Win = {
  p: { id: string; campaign_id: string; winner_handle: string; status: string; proof: string | null };
  c: Camp;
  drawnAt?: string;
};

const asM = (m: unknown): Metrics | null => (m ?? null) as Metrics | null;
const eng = (m: Metrics | null): number | null => {
  if (!m) return null;
  const vals = [m.likes, m.replies, m.reposts, m.quotes, m.bookmarks].filter((v): v is number => typeof v === "number");
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
};
const short = (n: number | null | undefined): string => {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1e6) return `${Math.round(n / 1e5) / 10}M`;
  if (a >= 1e3) return `${Math.round(n / 100) / 10}K`;
  return String(Math.round(n));
};
const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

/** Pay → draft → live → done/end pipeline, matching real funding + publish gates. */
function stOf(c: Camp, now: number): St {
  if (c.status === "drawn") return "done";
  if (c.status === "cancelled" || Date.parse(c.ends_at) <= now) return "end";
  const unpaid = !poolFunded(c);
  if (unpaid) return "pay";
  return c.tweet_url ? "live" : "draft";
}

const COND_ICON: Record<string, React.ElementType> = {
  min_likes: Heart, min_replies: MessageCircle, min_reposts: Repeat2,
  min_quotes: MessageSquare, min_views: Eye, min_participants: Users, min_verified: BadgeCheck,
};
const COND_TITLE: Record<string, string> = {
  min_likes: "cond.likes", min_replies: "cond.replies", min_reposts: "cond.reposts",
  min_quotes: "cond.quotes", min_views: "cond.views", min_participants: "cond.participants", min_verified: "cond.verified",
};
const condKeys = (c: Camp): string[] =>
  Object.keys(COND_ICON).filter((k) => typeof (c.conditions as Conditions | null)?.[k as keyof Conditions] === "number");

/** Daily-new series per metric over `days` days; fol is grouped by account handle to avoid double-counting. */
function dailySeries(snaps: SnapRow[], key: "view" | "eng" | "fol", days: number): number[] {
  const today = Math.floor(Date.now() / DAY);
  const start = today - days + 1;
  const groups = new Map<string, SnapRow[]>();
  for (const s of snaps) {
    const m = asM(s.metrics);
    const gk = key === "fol" ? (m?.author_handle?.toLowerCase() ?? s.campaign_id) : s.campaign_id;
    (groups.get(gk) ?? groups.set(gk, []).get(gk)!).push(s);
  }
  const out = new Array<number>(days).fill(0);
  for (const arr of groups.values()) {
    arr.sort((a, b) => Date.parse(a.fetched_at) - Date.parse(b.fetched_at));
    const daily = new Map<number, number>();
    for (const s of arr) {
      const m = asM(s.metrics);
      const v = key === "view" ? m?.views : key === "fol" ? m?.followers : eng(m);
      if (typeof v !== "number") continue;
      daily.set(Math.floor(Date.parse(s.fetched_at) / DAY), v);
    }
    const keys = [...daily.keys()].sort((a, b) => a - b);
    keys.forEach((d, i) => {
      const idx = d - start;
      if (idx < 0 || idx >= days) return;
      const pk = keys[i - 1];
      // First observed day is the baseline — without it a pre-existing
      // follower/view count would be booked as "new" on day one.
      const prev = i > 0 && pk !== undefined ? (daily.get(pk) ?? 0) : daily.get(d)!;
      out[idx] += Math.max(0, daily.get(d)! - prev);
    });
  }
  return out;
}

function Dashboard() {
  const { t, lang } = useI18n();
  const [range, setRange] = useState(30);
  const [metric, setMetric] = useState<"view" | "eng" | "fol">("view");
  const [q, setQ] = useState("");
  const [filt, setFilt] = useState<"all" | St>("all");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      const { data: campaigns } = await supabase.from("campaigns").select("*").eq("owner_id", uid).order("created_at", { ascending: false });
      const ids = (campaigns ?? []).map((c) => c.id);
      const snaps = ids.length
        ? await fetchAllSnaps<SnapRow>((from, size) => supabase.from("condition_snapshots").select("campaign_id, metrics, fetched_at").in("campaign_id", ids).order("fetched_at", { ascending: true }).range(from, from + size - 1))
        : [];

      // Campaigns I won: my X handles → payouts naming one of them.
      // Entries linked to the account plus the X identity the user signed in
      // with — reply-import entries carry user_id NULL, so the OAuth handle is
      // the only link for most winners.
      const { data: myEntries } = await supabase.from("entries").select("handle").eq("user_id", uid);
      const idt = (u.user.identities ?? []).find((i) => i.provider === "x" || i.provider === "twitter");
      const boundRaw = idt?.identity_data?.user_name ?? idt?.identity_data?.preferred_username ?? idt?.identity_data?.screen_name;
      const bound = typeof boundRaw === "string" && boundRaw ? boundRaw.trim().replace(/^@/, "") : null;
      const handleSet = new Set([...(myEntries ?? []).map((e2) => e2.handle), ...(bound ? [bound] : [])].filter(Boolean));
      const norm = new Set([...handleSet].map((h) => h.trim().toLowerCase().replace(/^@/, "")).filter(Boolean));
      const { data: myPayouts } = norm.size
        ? await supabase.from("payouts").select("id, campaign_id, winner_handle, status, proof").in("winner_handle", [...handleSet, ...norm])
        : { data: [] };
      const winPayouts = (myPayouts ?? []).filter((p) => norm.has((p.winner_handle ?? "").trim().toLowerCase().replace(/^@/, "")));
      const winIds = [...new Set(winPayouts.map((p) => p.campaign_id))];
      const [{ data: winCamps }, { data: winDraws }] = await Promise.all([
        winIds.length ? supabase.from("campaigns").select("*").in("id", winIds) : Promise.resolve({ data: [] }),
        winIds.length ? supabase.from("draws").select("campaign_id, drawn_at").in("campaign_id", winIds) : Promise.resolve({ data: [] }),
      ]);
      const campById = new Map((winCamps ?? []).map((c) => [c.id, c as Camp]));
      const drawnAtById = new Map((winDraws ?? []).map((d) => [d.campaign_id, d.drawn_at]));
      const wins: Win[] = winPayouts
        .map((p) => ({ p, c: campById.get(p.campaign_id)!, drawnAt: drawnAtById.get(p.campaign_id) }))
        .filter((w) => !!w.c);

      return { campaigns: (campaigns ?? []) as Camp[], snaps, wins };
    },
  });

  if (isLoading) {
    return (
      <div className="page-dash mx-auto max-w-[1240px] px-6 py-12">
        <Skeleton className="h-10 w-48" /><Skeleton className="mt-2 h-4 w-80" />
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[130px] rounded-[20px]" />)}</div>
        <Skeleton className="mt-5 h-[340px] rounded-[22px]" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="mx-auto flex max-w-[1240px] flex-col items-center gap-4 px-6 py-24 text-center">
        <p className="text-muted-foreground">{t("dash.loadError")}</p>
        <Button variant="outline" onClick={() => refetch()}>{t("dash.retry")}</Button>
      </div>
    );
  }

  const { campaigns, snaps, wins = [] } = data;
  const now = Date.now();
  const snapsByCamp = new Map<string, SnapRow[]>();
  for (const s of snaps) (snapsByCamp.get(s.campaign_id) ?? snapsByCamp.set(s.campaign_id, []).get(s.campaign_id)!).push(s);

  // ---- series & KPI ----
  const S = {
    view: dailySeries(snaps, "view", 90),
    eng: dailySeries(snaps, "eng", 90),
    fol: dailySeries(snaps, "fol", 90),
  };
  const sum = (a: number[], from: number, to: number) => a.slice(from, to).reduce((x, y) => x + y, 0);
  const vCur = sum(S.view, 90 - range, 90), vPrev = sum(S.view, Math.max(0, 90 - 2 * range), 90 - range);
  const eCur = sum(S.eng, 90 - range, 90), ePrev = sum(S.eng, Math.max(0, 90 - 2 * range), 90 - range);
  const fCur = Math.round(sum(S.fol, 90 - range, 90));
  const folCamps = campaigns.filter((c) => {
    const arr = snapsByCamp.get(c.id) ?? [];
    const first = asM(arr.find((s) => typeof asM(s.metrics)?.followers === "number")?.metrics);
    const last = asM(arr[arr.length - 1]?.metrics);
    return typeof first?.followers === "number" && typeof last?.followers === "number" && last.followers > first.followers;
  }).length;

  // ---- rows ----
  const rows = campaigns.map((c) => {
    const arr = snapsByCamp.get(c.id) ?? [];
    const lm = asM(arr[arr.length - 1]?.metrics);
    const firstF = asM(arr.find((s) => typeof asM(s.metrics)?.followers === "number")?.metrics);
    const growth = typeof lm?.followers === "number" && typeof firstF?.followers === "number" ? Math.max(0, lm.followers - firstF.followers) : null;
    return { c, lm, st: stOf(c, now), e: eng(lm), growth, handle: lm?.author_handle ?? null };
  });
  const cnt: Record<string, number> = { all: rows.length };
  for (const r of rows) cnt[r.st] = (cnt[r.st] ?? 0) + 1;
  const order: Record<St, number> = { pay: 0, draft: 1, live: 2, done: 3, end: 4 };
  const list = rows
    .filter((r) => (filt === "all" || r.st === filt) && (!q || (r.c.title + (r.handle ?? "")).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => order[a.st] - order[b.st] || Date.parse(b.c.created_at) - Date.parse(a.c.created_at));

  const TABS: [string, string][] = [
    ["all", t("dash.stAll")], ["live", t("status.open")], ["draft", t("dash.stWait")],
    ["pay", t("dash.stPay")], ["done", t("status.drawn")], ["end", t("status.ended")],
  ];
  const BADGE: Record<St, { cls: string; label: string }> = {
    pay: { cls: "b-pay", label: t("dash.stPay") },
    draft: { cls: "b-wait", label: t("dash.stWait") },
    live: { cls: "b-live", label: t("status.open") },
    done: { cls: "b-done", label: t("status.drawn") },
    end: { cls: "b-end", label: t("status.ended") },
  };
  const MIX_COL: Record<St, string> = { live: "#34d399", pay: "#fb923c", draft: "#f5b83d", done: "#7c5cff", end: "#646f85" };
  const mixOrder: St[] = ["live", "draft", "pay", "done", "end"];
  const LBL: Record<"view" | "eng" | "fol", string> = { view: t("dash.suffView"), eng: t("dash.suffEng"), fol: t("dash.suffFol") };
  const METRIC_LABEL: Record<"view" | "eng" | "fol", string> = { view: t("trend.impressions"), eng: t("trend.engagements"), fol: t("dash.mFol") };
  const chartArr = S[metric].slice(90 - range);
  const chartSum = chartArr.reduce((a, b) => a + b, 0);

  return (
    <div className="page-dash" style={{ maxWidth: 1240, margin: "0 auto", padding: "48px 24px 80px" }}>
      {/* ── hero ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-.01em" }}>{t("dash.title")}</h1>
          <p style={{ color: "var(--muted-foreground)", marginTop: 8 }}>{t("dash.subtitle")}</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <select className="sel" value={range} onChange={(e) => setRange(Number(e.target.value))} aria-label={lang === "zh" ? "时间范围" : "Range"}>
            {[7, 30, 90].map((d) => <option key={d} value={d}>{t(`range.${d}` as "range.7")}</option>)}
          </select>
          <Link to="/new" className="btn-gradient" style={{ textDecoration: "none", width: "auto", padding: "0 20px" }}>
            <Plus style={{ width: 18, height: 18 }} />{t("dash.new")}
          </Link>
        </div>
      </div>

      {/* ── stats ── */}
      <div className="stats">
        <div className="panel stat">
          <div className="stat-h">{t("kpi.impressions")}<span className="stat-ic" style={{ background: "rgba(56,189,248,.12)", color: "#38bdf8" }}><Eye /></span></div>
          <div className="stat-v">{short(vCur)}</div>
          <div className="stat-f"><Delta prev={vPrev} cur={vCur} /><Spark arr={S.view} color="#38bdf8" /></div>
        </div>
        <div className="panel stat">
          <div className="stat-h">{t("kpi.engagements")}<span className="stat-ic" style={{ background: "rgba(124,92,255,.14)", color: "#a99bff" }}><Activity /></span></div>
          <div className="stat-v">{short(eCur)}</div>
          <div className="stat-f"><Delta prev={ePrev} cur={eCur} /><Spark arr={S.eng} color="#a99bff" /></div>
        </div>
        <div className="panel stat">
          <div className="stat-h">{t("kpi.growth")}<span className="stat-ic" style={{ background: "rgba(52,211,153,.12)", color: "#34d399" }}><UserPlus /></span></div>
          <div className="stat-v" style={{ color: "#34d399" }}>+{fCur}</div>
          <div className="stat-f"><span className="delta">{t("dash.fromPre")} <b>{folCamps}</b> {t("dash.fromPost")}</span><Spark arr={S.fol} color="#34d399" /></div>
        </div>
        <div className="panel stat">
          <div className="stat-h">{t("dash.stCamps")}<span className="stat-ic" style={{ background: "rgba(245,184,61,.12)", color: "#f5b83d" }}><Gift /></span></div>
          <div className="stat-v">{campaigns.length}</div>
          <div className="mix">{mixOrder.filter((k) => cnt[k]).map((k) => <i key={k} style={{ flex: cnt[k], background: MIX_COL[k] }} />)}</div>
          <div className="mix-l">{mixOrder.filter((k) => cnt[k]).map((k) => <span key={k} style={{ "--c": MIX_COL[k] } as React.CSSProperties}>{BADGE[k].label} {cnt[k]}</span>)}</div>
        </div>
      </div>

      {/* ── chart ── */}
      <section className="panel chart-p">
        <div className="chart-h">
          <div>
            <h2>{t("trend.title")}</h2>
            <p>{t("dash.chartSub")}</p>
            <div className="chart-sum">{metric === "fol" ? `+${Math.round(chartSum)}` : short(chartSum)}<small>{t(`range.${range}` as "range.7")} {LBL[metric]}</small></div>
          </div>
          <div className="pills" role="tablist">
            {(["view", "eng", "fol"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={metric === k} onClick={() => setMetric(k)}>{METRIC_LABEL[k]}</button>
            ))}
          </div>
        </div>
        <BarsChart arr={chartArr} range={range} isFol={metric === "fol"} suffix={LBL[metric]} />
      </section>

      {/* ── list ── */}
      <section>
        <div className="list-h">
          <div>
            <h2>{t("tbl.title")}</h2>
            <p>{t("tbl.subtitle")}</p>
          </div>
          <div className="tools">
            <div className="pills tabs" role="tablist">
              {TABS.map(([k, n]) => (
                <button key={k} role="tab" aria-selected={filt === k} onClick={() => setFilt(k as "all" | St)}>
                  {n}<span className="c">{cnt[k] ?? 0}</span>
                </button>
              ))}
            </div>
            <label className="search">
              <Search />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("dash.searchPh")} aria-label={t("dash.searchPh")} />
            </label>
          </div>
        </div>

        <div className="panel table">
          <div className="thead">
            <span>{t("tbl.campaign")}</span><span>{t("tbl.status")}</span><span>{t("tbl.progress")}</span>
            <span className="r">{t("tbl.impressions")}</span><span className="r">{t("tbl.engagements")}</span>
            <span className="r">{t("tbl.growth")}</span><span className="r">{t("tbl.created")}</span><span className="r">{t("tbl.actions")}</span>
          </div>
          {campaigns.length === 0 ? (
            <div className="empty">
              <Zap style={{ width: 26, height: 26, color: "#f5b83d", margin: "0 auto 10px" }} />
              <h3>{t("dash.emptyTitle")}</h3>
              <p>{t("dash.emptyDesc")}</p>
              <Link to="/new" className="btn-gradient" style={{ textDecoration: "none", width: "auto", padding: "0 20px", display: "inline-flex" }}>{t("dash.emptyCta")}</Link>
            </div>
          ) : list.length === 0 ? (
            <div className="empty">
              <h3>{t("dash.emptyT")}</h3>
              <p>{t("dash.emptyP")}</p>
            </div>
          ) : (
            list.map((r) => <CampRow key={r.c.id} r={r} badge={BADGE[r.st]} />)
          )}
        </div>
      </section>

      {/* ── campaigns I won ── */}
      {wins.length > 0 && (
        <section style={{ marginTop: 40 }}>
          <div className="list-h">
            <div>
              <h2>{t("win.title")}</h2>
              <p>{t("win.sub")}</p>
            </div>
          </div>
          <div className="panel table">
            <div className="thead wcols">
              <span>{t("tbl.campaign")}</span>
              <span className="r">{t("win.prize")}</span><span className="r">{t("win.payout")}</span><span className="r">{t("win.drawn")}</span><span className="r">{t("tbl.actions")}</span>
            </div>
            {wins.map(({ p, c, drawnAt }) => {
              const per = c.prize_amount !== null && c.winners_count ? Math.round((c.prize_amount / c.winners_count) * 100) / 100 : null;
              const paid = p.status === "paid";
              return (
                <div key={p.id} className="tr wcols">
                  <div className="act">
                    <span className="av" style={{ background: avGrad(p.winner_handle ?? "?") }}>{(p.winner_handle ?? "?").slice(0, 2).toUpperCase()}</span>
                    <div className="act-m">
                      <div className="act-t"><Link to="/r/$slug" params={{ slug: c.slug }}>{c.title}</Link></div>
                      <div className="act-s">@{p.winner_handle ?? "—"}</div>
                    </div>
                  </div>
                  <span className="metric r">{per !== null ? `${per} ${c.currency}` : c.prize}</span>
                  <div className="st" style={{ justifySelf: "end" }}>
                    <span className={`badge ${paid ? "b-live" : "b-wait"}`}>{paid ? t("r.paid") : p.status === "paying" ? t("win.paying") : t("r.pending")}</span>
                  </div>
                  <span className="date r">{drawnAt ? md(new Date(drawnAt)) : "—"}</span>
                  <div className="ops">
                    {paid ? (
                      <Link to="/r/$slug" params={{ slug: c.slug }} className="ib" data-tip={t("c.result")} aria-label={t("c.result")}><BarChart3 /></Link>
                    ) : (
                      <Link to="/r/$slug/claim" params={{ slug: c.slug }} className="cta">{t("win.claim")}</Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Delta({ prev, cur }: { prev: number; cur: number }) {
  const { t } = useI18n();
  const p = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  return (
    <span className="delta">
      {p === null ? t("kpi.noData") : <>{t("dash.vsPrev")} <b className="up">{p >= 0 ? "↑" : "↓"} {Math.abs(p)}%</b></>}
    </span>
  );
}

function Spark({ arr, color }: { arr: number[]; color: string }) {
  const a = arr.slice(-14);
  const mx = Math.max(...a, 1);
  const pts = a.map((v, i) => `${(i / (a.length - 1)) * 84},${26 - Math.sqrt(v / mx) * 24}`).join(" ");
  return (
    <svg className="spark" viewBox="0 0 84 28" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Bar chart with sqrt y-scale, hover crosshair and tooltip — mirrors the mockup. */
function BarsChart({ arr, range, isFol, suffix }: { arr: number[]; range: number; isFol: boolean; suffix: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  const [hov, setHov] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const H = 280, L = 48, R = 8, T = 10, B = 28;
  const iw = W - L - R, ih = H - T - B;
  const mx = Math.max(...arr, 1);
  const y = (v: number) => T + ih - Math.sqrt(v / mx) * ih;
  const bw = Math.max(2, (iw / arr.length) * 0.62);
  const x = (i: number) => L + (i + 0.5) * (iw / arr.length);
  const today = new Date();
  const dateOf = (i: number) => new Date(today.getTime() - (arr.length - 1 - i) * DAY);
  const step = range <= 7 ? 1 : range <= 30 ? 5 : 15;

  const onMove = (e: React.MouseEvent) => {
    const rc = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rc.left) / rc.width) * W;
    setHov(Math.min(arr.length - 1, Math.max(0, Math.floor((px - L) / (iw / arr.length)))));
  };

  return (
    <div className="chart-box" ref={ref}>
      {W > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} aria-label="daily trend">
          <defs>
            <linearGradient id="bg1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7c5cff" /><stop offset="1" stopColor="#3b82f6" stopOpacity=".55" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 1].map((f) => {
            const v = mx * f * f, yy = y(v);
            return (
              <g key={f}>
                <line x1={L} x2={W - R} y1={yy} y2={yy} stroke="rgba(255,255,255,.06)" strokeDasharray={f === 0 ? undefined : "3 4"} />
                <text x={L - 10} y={yy + 4} textAnchor="end" fill="#646f85" fontSize="11" fontFamily="Bricolage Grotesque,sans-serif">{short(v)}</text>
              </g>
            );
          })}
          {arr.map((v, i) => {
            const h = Math.max(v > 0 ? 2 : 0, T + ih - y(v));
            return (
              <g key={i}>
                <rect x={x(i) - bw / 2} y={T + ih - h} width={bw} height={h} rx={Math.min(3, bw / 2)} fill="url(#bg1)" opacity={hov === null || hov === i ? 1 : 0.45} />
                {(arr.length - 1 - i) % step === 0 && (
                  <text x={x(i)} y={H - 6} textAnchor="middle" fill="#646f85" fontSize="11" fontFamily="Bricolage Grotesque,sans-serif">{md(dateOf(i))}</text>
                )}
              </g>
            );
          })}
          {hov !== null && <line x1={x(hov)} x2={x(hov)} y1={T} y2={T + ih} stroke="rgba(255,255,255,.25)" strokeDasharray="3 3" />}
          <rect x={L} y={T} width={iw} height={ih} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHov(null)} />
        </svg>
      )}
      {hov !== null && W > 0 && (
        <div className="tip" style={{ left: Math.min(W - 70, Math.max(70, x(hov))), top: y(arr[hov]) }}>
          <b>{isFol ? `+${Math.round(arr[hov])}` : short(arr[hov])}</b>
          <span>{md(dateOf(hov))} · {suffix}</span>
        </div>
      )}
    </div>
  );
}

const AV_GRADS = [
  "radial-gradient(circle at 30% 30%,#5aa0ff,#173a8a)",
  "linear-gradient(135deg,#f59e9e,#b45f7c)",
  "linear-gradient(135deg,#8b6b4a,#3a2a1e)",
  "linear-gradient(135deg,#5eead4,#0f766e)",
  "linear-gradient(135deg,#a78bfa,#4c1d95)",
];
const avGrad = (h: string) => AV_GRADS[[...h].reduce((s, c) => s + c.charCodeAt(0), 0) % AV_GRADS.length];

function CampRow({ r, badge }: { r: { c: Camp; lm: Metrics | null; st: St; e: number | null; growth: number | null; handle: string | null }; badge: { cls: string; label: string } }) {
  const { t } = useI18n();
  const { c, lm, st, e, growth, handle } = r;
  const conds = condKeys(c);
  const goal = (c.conditions as Conditions | null)?.min_replies;
  const now = typeof lm?.replies === "number" ? lm.replies : null;
  const pct = typeof goal === "number" && goal > 0 && now !== null ? Math.min(100, Math.round((now / goal) * 100)) : null;

  return (
    <div className="tr">
      <div className="act">
        {handle ? (
          <span className="av" style={{ background: avGrad(handle) }}>{handle.replace(/^@/, "").slice(0, 2).toUpperCase()}</span>
        ) : (
          <span className="av gen"><MessageCircle /></span>
        )}
        <div className="act-m">
          <div className="act-t"><Link to="/c/$slug" params={{ slug: c.slug }}>{c.title}</Link></div>
          <div className="act-s">
            {c.prize_amount !== null && <span className="prize">{c.prize_amount}<small>{c.currency}</small></span>}
            {c.winners_count != null && <span>{c.winners_count} {t("dash.winners")}</span>}
            {handle && <span>@{handle}</span>}
            {conds.length > 0 && (
              <span className="conds">
                {conds.map((k) => {
                  const I = COND_ICON[k];
                  return <span key={k} title={t(COND_TITLE[k] as "cond.likes")}><I /></span>;
                })}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="st"><span className={`badge ${badge.cls}`}>{badge.label}</span></div>
      {st === "pay" ? (
        <span className="wait-note">{t("dash.payNote")}</span>
      ) : st === "draft" ? (
        <span className="wait-note">{t("dash.waitNote")}</span>
      ) : pct !== null ? (
        <div className="prog">
          <div className="prog-t"><span><b>{now}</b> / {goal}</span><span>{pct}%</span></div>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
      ) : st === "live" ? (
        <span className="wait-note"><span className="live-dot" />{t("dash.fetching")}</span>
      ) : (
        <span className="metric dim">—</span>
      )}
      <span className="metric r">{short(lm?.views)}</span>
      <span className="metric r">{short(e)}</span>
      <span className={`metric r ${growth !== null && growth > 0 ? "up" : "dim"}`}>{growth !== null && growth > 0 ? `+${growth}` : "0"}</span>
      <span className="date r">{md(new Date(c.created_at))}</span>
      <div className="ops">
        {st === "pay" ? (
          <>
            <Link to="/manage/$id" params={{ id: c.id }} className="cta">{t("dash.payCta")}</Link>
            <Link to="/manage/$id" params={{ id: c.id }} className="ib" data-tip={t("tbl.manage")} aria-label={t("tbl.manage")}><MoreHorizontal /></Link>
          </>
        ) : st === "draft" ? (
          <>
            <Link to="/manage/$id" params={{ id: c.id }} className="cta">{t("dash.publish")}</Link>
            <Link to="/manage/$id" params={{ id: c.id }} className="ib" data-tip={t("tbl.manage")} aria-label={t("tbl.manage")}><MoreHorizontal /></Link>
          </>
        ) : (
          <>
            <Link to="/c/$slug" params={{ slug: c.slug }} className="ib" data-tip={t("tbl.analytics")} aria-label={t("tbl.analytics")}><BarChart3 /></Link>
            {c.tweet_url && <a href={c.tweet_url} target="_blank" rel="noreferrer" className="ib" data-tip={t("tbl.openPost")} aria-label={t("tbl.openPost")}><ExternalLink /></a>}
            <Link to="/manage/$id" params={{ id: c.id }} className="ib" data-tip={t("tbl.manage")} aria-label={t("tbl.manage")}><MoreHorizontal /></Link>
          </>
        )}
      </div>
      {st !== "live" && lm && (
        <div className="mrow">
          <span>{t("tbl.impressions")}<b>{short(lm.views)}</b></span>
          <span>{t("tbl.engagements")}<b>{short(e)}</b></span>
          <span>{t("tbl.growth")}<b>{growth !== null && growth > 0 ? `+${growth}` : "0"}</b></span>
        </div>
      )}
    </div>
  );
}

