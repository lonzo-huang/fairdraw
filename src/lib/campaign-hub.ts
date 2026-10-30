export type HubCampaign = {
  id: string; slug: string; title: string; prize: string; prize_amount: number | null;
  currency: string; winners_count: number; ends_at: string; created_at: string;
  status: string; tweet_url: string | null; owner_id: string; clicks: number; conditions?: unknown;
};
export type HubTab = "latest" | "ending" | "top" | "drawn";
export function filterHub(campaigns: HubCampaign[], tab: HubTab, now: number, currency = "USDT") {
  const active = campaigns.filter((c) => c.status === "open" && Date.parse(c.ends_at) > now);
  if (tab === "drawn") return campaigns.filter((c) => c.status === "drawn").sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 12);
  if (tab === "ending") return active.filter((c) => Date.parse(c.ends_at) - now < 2 * 60 * 60 * 1000).sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at)).slice(0, 12);
  if (tab === "top") return active.filter((c) => c.currency === currency && c.prize_amount !== null).sort((a, b) => (b.prize_amount ?? 0) - (a.prize_amount ?? 0)).slice(0, 12);
  return active.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 12);
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
  if (c.status === "open" && remaining > 0 && remaining < 2 * 60 * 60 * 1000) badges.push("ending");
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
/** Rank declared drawn pools, not payments, in one currency and UTC calendar period. */
export function rankSponsors(campaigns: HubCampaign[], draws: HubDraw[], now: number, period: RankPeriod, currency: string) {
  const start = periodStart(now, period);
  const ranked = new Map<string, { campaign: HubCampaign; amount: number; count: number }>();
  for (const draw of draws) {
    const at = Date.parse(draw.drawn_at);
    const c = campaigns.find((v) => v.id === draw.campaign_id);
    if (!c || c.status !== "drawn" || c.currency !== currency || c.prize_amount === null || at < start || at > now) continue;
    const key = xHandleFromUrl(c.tweet_url)?.toLowerCase() ?? c.owner_id;
    const prev = ranked.get(key);
    ranked.set(key, { campaign: prev?.campaign ?? c, amount: (prev?.amount ?? 0) + c.prize_amount, count: (prev?.count ?? 0) + 1 });
  }
  return [...ranked.values()].sort((a, b) => b.amount - a.amount || a.campaign.id.localeCompare(b.campaign.id));
}
export function todayLeader(campaigns: HubCampaign[], now: number, currency: string) {
  return campaigns.filter((c) => c.currency === currency && c.prize_amount !== null && Date.parse(c.created_at) >= periodStart(now, "day") && Date.parse(c.created_at) <= now && ["open", "drawn"].includes(c.status)).sort((a, b) => (b.prize_amount ?? 0) - (a.prize_amount ?? 0))[0];
}
export function winnerHandles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v: unknown) => {
    if (!v || typeof v !== "object" || !("handle" in v) || typeof v.handle !== "string") return [];
    const h = cleanHandle(v.handle); return h ? [h] : [];
  });
}
