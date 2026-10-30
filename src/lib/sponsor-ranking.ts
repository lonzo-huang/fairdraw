import { rankSponsors, xHandleFromUrl, type HubCampaign, type HubDraw, type RankPeriod } from "@/lib/campaign-hub";

export type SponsorRank = { id: string; handle: string | null; name: string; amount: number; count: number; slug?: string; sample: boolean };
// Names observed on https://xbangdan.com/accounts/ on 2026-10-29.
// Monetary values below are intentionally simulated and never stored as campaign records.
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
export function sampleSponsorRanking(period: RankPeriod): SponsorRank[] {
  const scale = period === "month" ? 1 : period === "week" ? 0.25 : 0.05;
  const shift = period === "month" ? 0 : period === "week" ? 2 : 4;
  return accounts.map((_, i) => {
    const [handle, name] = accounts[(i + shift) % accounts.length] ?? accounts[0];
    return { id: `sample-${handle}`, handle, name, amount: Math.round((24000 - i * 1750) * scale), count: Math.max(1, Math.round((36 - i * 2) * scale)), sample: true };
  });
}
export function liveSponsorRanking(campaigns: HubCampaign[], draws: HubDraw[], now: number, period: RankPeriod, currency: string, names: Map<string, string | null>): SponsorRank[] {
  return rankSponsors(campaigns, draws, now, period, currency).map(({ campaign: c, amount, count }) => {
    const handle = xHandleFromUrl(c.tweet_url);
    return { id: c.id, handle, name: handle ? xDisplayName(handle) : names.get(c.owner_id) ?? "—", amount, count, slug: c.slug, sample: false };
  });
}
export function top50(rows: SponsorRank[]) { return [...rows].sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id)).slice(0, 50); }