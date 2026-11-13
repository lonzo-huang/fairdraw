export type HubCampaign = {
  id: string; slug: string; title: string; prize: string; prize_amount: number | null;
  currency: string; winners_count: number; ends_at: string; created_at: string;
  status: string; escrow_status: string; tweet_url: string | null; owner_id: string; clicks: number; conditions?: unknown;
  /** Demo campaigns: declared pool is never funded, winners are never paid. */
  is_simulated?: boolean;
};
export type HubTab = "latest" | "ending" | "top" | "drawn";
/** Rough USD equivalents — used only to order cross-currency boards. Displayed amounts keep the declared currency. Unknown currencies rate 0 so they can never top a board on unpriced numbers. */
const USD_RATES: Record<string, number> = { USD: 1, USDT: 1, CNY: 0.14, EUR: 1.08, GBP: 1.27 };
export function usdValue(amount: number | null, currency: string): number {
  return (amount ?? 0) * (USD_RATES[currency.toUpperCase()] ?? 0);
}
/** A campaign is only really running once the pool is funded and the post is
 * bound. Drafts still awaiting payment or a tweet never enter public boards. */
const FUNDED_ESCROW = new Set(["funded", "preauthorized"]);
/** A declared pool is only real money once escrow confirms funding. Campaigns
 * with no declared amount never need funding; payment_method may still be
 * unset (draft) so it cannot gate this check. */
export function poolFunded(c: Pick<HubCampaign, "prize_amount" | "escrow_status" | "is_simulated">) {
  // Simulated pools never fund — they're treated as ready so the draw can run.
  return c.is_simulated === true || !c.prize_amount || FUNDED_ESCROW.has(c.escrow_status);
}
export function isLive(c: HubCampaign, now: number) {
  return c.status === "open" && Date.parse(c.ends_at) > now && poolFunded(c) && !!c.tweet_url;
}
export function filterHub(campaigns: HubCampaign[], tab: HubTab, now: number, currency = "ALL") {
  const active = campaigns.filter((c) => isLive(c, now));
  if (tab === "drawn") return campaigns.filter((c) => c.status === "drawn").sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 12);
  if (tab === "ending") return active.filter((c) => Date.parse(c.ends_at) - now < 8 * 60 * 60 * 1000).sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at));
  if (tab === "top") {
    const pools = currency === "ALL" ? active : active.filter((c) => c.currency === currency);
    return pools.filter((c) => c.prize_amount !== null).sort((a, b) => usdValue(b.prize_amount, b.currency) - usdValue(a.prize_amount, a.currency));
  }
  return active.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
export function simulateCost(pool: number, target: number) { return pool / (target * 2); }

export type HubBadge = "hot" | "big" | "ending";
// Badges are derived only from real campaign data; never fabricate activity stats.
export function campaignBadges(c: HubCampaign, progress: number | null, now: number): HubBadge[] {
  const badges: HubBadge[] = [];
  if (progress !== null && progress >= 80) badges.push("hot");
  const big = c.prize_amount !== null && (c.currency === "CNY" ? c.prize_amount >= 5000 : c.prize_amount >= 1000);
  if (big) badges.push("big");
  const remaining = Date.parse(c.ends_at) - now;
  if (c.status === "open" && remaining > 0 && remaining < 8 * 60 * 60 * 1000) badges.push("ending");
  return badges;
}
export function hostInitial(name: string | null | undefined) {
  const first = name?.trim().charAt(0);
  return first ? first.toUpperCase() : "F";
}
/** Extract the X username from a tweet URL like https://x.com/name/status/123. */
export function xHandleFromUrl(url: string | null | undefined) {
  const m = url?.match(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:\/|$|\?)/);
  if (!m) return null;
  const h = m[1] ?? "";
  if (!h) return null;
  return ["i", "intent", "home", "search", "share"].includes(h.toLowerCase()) ? null : h;
}
export function cleanHandle(h: string) { return h.trim().replace(/^@/, ""); }

export type RankPeriod = "month" | "week" | "day";
export type HubDraw = { campaign_id: string; drawn_at: string; winners: unknown };
export function periodStart(now: number, period: RankPeriod) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  if (period === "month") d.setUTCDate(1);
  if (period === "week") d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.getTime();
}
/** Page through an ascending snapshot query so a row cap never truncates history. */
export async function fetchAllSnaps<T>(page: (from: number, size: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, size = 1000, maxPages = 100): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const { data, error } = await page(out.length, size);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < size) break;
  }
  return out;
}
export function todayLeader(campaigns: HubCampaign[], now: number) {
  // Simulated pools are declared but never paid — they must never top money boards.
  return campaigns.filter((c) => c.prize_amount !== null && !c.is_simulated && Date.parse(c.created_at) >= periodStart(now, "day") && Date.parse(c.created_at) <= now && (c.status === "drawn" || (c.status === "open" && poolFunded(c)))).sort((a, b) => usdValue(b.prize_amount, b.currency) - usdValue(a.prize_amount, a.currency))[0];
}
export function winnerHandles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v: unknown) => {
    if (!v || typeof v !== "object" || !("handle" in v) || typeof v.handle !== "string") return [];
    const h = cleanHandle(v.handle); return h ? [h] : [];
  });
}
