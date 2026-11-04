import { periodStart, xHandleFromUrl, type HubCampaign, type RankPeriod } from "@/lib/campaign-hub";
import type { Metrics } from "@/lib/conditions";

export type ImpactMetric = "score" | "reach" | "engagement" | "growth";
export type ImpactRow = {
  id: string;
  handle: string | null;
  name: string;
  /** Summed latest post impressions across the handle's campaigns in the period. */
  reach: number | null;
  /** Summed latest likes+replies+reposts+quotes+bookmarks in the period. */
  engagement: number | null;
  /** Account-level follower delta within the period (never summed across campaigns). */
  growth: number | null;
  campaigns: number;
  /** In-period campaigns behind this handle, newest first — links to their detail pages. */
  campList: { slug: string; title: string }[];
  /** 0-100 weighted percentile score; see WEIGHTS. */
  score: number;
  reachScore: number | null;
  engagementScore: number | null;
  growthScore: number | null;
  sample: boolean;
};
export type SnapLite = { campaign_id: string; fetched_at: string; metrics: unknown };

// Names observed on https://xbangdan.com/accounts/ on 2026-10-29.
// Metric values below are intentionally simulated and never stored as campaign records.
const accounts = [
  ["xupaopaogm", "徐跑跑"], ["zuichunyan123", "醉春烟💗"], ["DISONYYDS", "Dison"],
  ["zhang2888", "小心"], ["vicentyip", "如是我闻"], ["michaelzsguo", "Michael Guo"],
  ["rming_luckin", "R鸣"], ["wangchangfu88", "王长富"], ["chakmillion", "查百万"],
  ["Btc8888XF", "7w 🕊️"], ["Zen_with_AI", "山景城小路"], ["zhngkn414984690", "张卡"],
] as const;

export function xDisplayName(handle: string, fallback?: string | null) {
  if (handle.toLowerCase() === "mirrortekuk") return "英格兰AI哥";
  return accounts.find(([h]) => h.toLowerCase() === handle.toLowerCase())?.[1] ?? fallback?.trim() ?? handle;
}

const WEIGHTS = { reach: 0.4, engagement: 0.35, growth: 0.25 } as const;

const asM = (m: unknown): Metrics | null => (m ?? null) as Metrics | null;
const engOf = (m: Metrics | null): number | null => {
  if (!m) return null;
  const vals = [m.likes, m.replies, m.reposts, m.quotes, m.bookmarks].filter((v): v is number => typeof v === "number");
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
};

/** Percentile 0-100 within the cohort; null stays null; a cohort of one scores 50. */
function percentiles(values: (number | null)[]): (number | null)[] {
  const idx = values.flatMap((v, i) => (v === null ? [] : [i]));
  const n = idx.length;
  const out: (number | null)[] = values.map(() => null);
  if (n === 0) return out;
  if (n === 1) { out[idx[0]!] = 50; return out; }
  for (const i of idx) {
    const v = values[i]!;
    const less = idx.filter((j) => values[j]! < v).length;
    out[i] = (less / (n - 1)) * 100;
  }
  return out;
}

type Base = Omit<ImpactRow, "score" | "reachScore" | "engagementScore" | "growthScore">;
/** Attach percentile sub-scores and the weighted Impact Score (weights re-normalise over available metrics). */
export function scoreRows(rows: Base[]): ImpactRow[] {
  const reachP = percentiles(rows.map((r) => r.reach));
  const engP = percentiles(rows.map((r) => r.engagement));
  const growP = percentiles(rows.map((r) => r.growth));
  return rows.map((r, i) => {
    const rs = reachP[i] ?? null, es = engP[i] ?? null, gs = growP[i] ?? null;
    const parts: [number, number][] = [
      [WEIGHTS.reach, rs], [WEIGHTS.engagement, es], [WEIGHTS.growth, gs],
    ].filter((p): p is [number, number] => p[1] !== null);
    const denom = parts.reduce((s, [w]) => s + w, 0);
    const score = denom ? Math.round((parts.reduce((s, [w, p]) => s + w * p, 0) / denom) * 10) / 10 : 0;
    return { ...r, score, reachScore: rs, engagementScore: es, growthScore: gs };
  });
}

export function sampleImpactRanking(period: RankPeriod): ImpactRow[] {
  const scale = period === "month" ? 1 : period === "week" ? 0.3 : 0.06;
  const shift = period === "month" ? 0 : period === "week" ? 2 : 4;
  const rows: Base[] = accounts.map((_, i) => {
    const [handle, name] = accounts[(i + shift) % accounts.length] ?? accounts[0];
    const k = (accounts.length - i) / accounts.length;
    // Per-metric jitter decorrelates the fixtures so each metric tab sorts differently.
    const jr = 0.55 + ((i * 5 + shift) % 9) / 10;
    const je = 0.55 + ((i * 7 + shift * 2) % 9) / 10;
    const jg = 0.55 + ((i * 3 + shift * 4) % 9) / 10;
    return {
      id: `sample-${handle}`, handle, name,
      reach: Math.round(4_800_000 * k * jr * scale),
      engagement: Math.round(96_000 * k * je * scale),
      growth: Math.round(9_600 * k * jg * scale),
      campaigns: Math.max(1, Math.round((accounts.length - i) / 2)),
      campList: [],
      sample: true,
    };
  });
  return scoreRows(rows);
}

/**
 * Community-impact ranking: aggregate per X handle over snapshots inside the UTC period.
 * Reach/engagement use the latest in-period snapshot per campaign (cumulative post metrics);
 * growth is the account-level follower delta over the handle's combined snapshot series,
 * so parallel campaigns never double-count the same account.
 */
export function liveImpactRanking(campaigns: HubCampaign[], snaps: SnapLite[], now: number, period: RankPeriod, names: Map<string, string | null>): ImpactRow[] {
  const start = periodStart(now, period);
  const byCamp = new Map<string, SnapLite[]>();
  for (const s of snaps) {
    const t = Date.parse(s.fetched_at);
    if (t < start || t > now) continue;
    (byCamp.get(s.campaign_id) ?? byCamp.set(s.campaign_id, []).get(s.campaign_id)!).push(s);
  }
  const camps = new Map(campaigns.map((c) => [c.id, c]));
  type Acc = { handle: string | null; owner: string; reach: number[]; eng: number[]; followers: [number, number][]; count: number; camps: { slug: string; title: string; created_at: string }[] };
  const acc = new Map<string, Acc>();
  for (const [cid, arr] of byCamp) {
    const c = camps.get(cid);
    if (!c) continue;
    arr.sort((a, b) => Date.parse(a.fetched_at) - Date.parse(b.fetched_at));
    const last = asM(arr[arr.length - 1]!.metrics);
    const handle = last?.author_handle ?? xHandleFromUrl(c.tweet_url);
    const key = handle?.toLowerCase() ?? `u:${c.owner_id}`;
    const e = acc.get(key) ?? { handle, owner: c.owner_id, reach: [], eng: [], followers: [], count: 0, camps: [] };
    e.count += 1;
    e.camps.push({ slug: c.slug, title: c.title, created_at: c.created_at });
    if (typeof last?.views === "number") e.reach.push(last.views);
    const eg = engOf(last);
    if (eg !== null) e.eng.push(eg);
    for (const s of arr) {
      const f = asM(s.metrics)?.followers;
      if (typeof f === "number") e.followers.push([Date.parse(s.fetched_at), f]);
    }
    acc.set(key, e);
  }
  const rows: Base[] = [...acc.entries()].map(([key, a]) => {
    const fs = a.followers.sort((x, y) => x[0] - y[0]);
    const growth = fs.length >= 2 ? Math.max(0, fs[fs.length - 1]![1] - fs[0]![1]) : null;
    return {
      id: key,
      handle: a.handle,
      name: a.handle ? xDisplayName(a.handle) : names.get(a.owner) ?? "—",
      reach: a.reach.length ? a.reach.reduce((s, v) => s + v, 0) : null,
      engagement: a.eng.length ? a.eng.reduce((s, v) => s + v, 0) : null,
      growth,
      campaigns: a.count,
      campList: [...a.camps].sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at)).map(({ slug, title }) => ({ slug, title })),
      sample: false,
    };
  });
  return scoreRows(rows);
}

const metricVal = (r: ImpactRow, metric: ImpactMetric) =>
  metric === "reach" ? r.reachScore : metric === "engagement" ? r.engagementScore : metric === "growth" ? r.growthScore : r.score;
/** Top 50 by the selected metric; rows missing that metric rank last. */
export function topImpact(rows: ImpactRow[], metric: ImpactMetric) {
  return [...rows].sort((a, b) => (metricVal(b, metric) ?? -1) - (metricVal(a, metric) ?? -1) || b.score - a.score || a.id.localeCompare(b.id)).slice(0, 50);
}