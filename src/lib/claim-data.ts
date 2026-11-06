/**
 * Claim-flow shared fixtures & types used by the winner claim page
 * (/r/:slug/claim) and the result page.
 */

/**
 * Stripe Express recipient accounts are only supported for connected accounts
 * in the platform's own region (GB/EEA/CH/NO/IS/LI). Winners elsewhere claim
 * via Wise.
 */
export const RECIPIENT_COUNTRIES = ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IS","IE","IT","LV","LI","LT","LU","MT","NL","NO","PL","PT","RO","SK","SI","ES","SE","CH","GB"];

export type WiseReq = {
  type: string;
  title: string;
  fields?: { name: string; group?: { key: string; name?: string; type?: string; required?: boolean; valuesAllowed?: { key: string; name: string }[] }[] }[];
};

// ---------------------------------------------------------------------------
// Gift-card claim fixture. Placeholder catalogue standing in for a real
// gift-card provider — regions, brands and denominations are declared options
// the winner picks; fulfilment is recorded via claim_info until a provider is
// wired in.
// ---------------------------------------------------------------------------

export type GiftRegion = { k: string; n: string; nEn: string; cur: keyof typeof FX };
export type GiftCard = { id: string; n: string; nEn: string; c: string; cEn: string; bg: string; ab: string; min?: number; max?: number; fixed?: number[] };

/** Reference rates: 1 unit of currency = ? CNY. Display-only. */
export const FX: Record<string, number> = { CNY: 1, USD: 7.1, EUR: 7.75 };
export const SYM: Record<string, string> = { CNY: "¥", USD: "$", EUR: "€" };

export const REGIONS: GiftRegion[] = [
  { k: "CN", n: "中国大陆", nEn: "Mainland China", cur: "CNY" },
  { k: "NL", n: "荷兰", nEn: "Netherlands", cur: "EUR" },
  { k: "US", n: "美国", nEn: "United States", cur: "USD" },
];

export const CATALOG: Record<string, GiftCard[]> = {
  CN: [
    { id: "jd", n: "京东 E 卡", nEn: "JD.com E-card", c: "购物", cEn: "Shopping", bg: "#e1251b", ab: "JD", min: 10, max: 5000 },
    { id: "tmall", n: "天猫超市卡", nEn: "Tmall card", c: "购物", cEn: "Shopping", bg: "#ff5000", ab: "天猫", fixed: [50, 100, 200, 500] },
    { id: "ctrip", n: "携程礼品卡", nEn: "Trip.com card", c: "出行", cEn: "Travel", bg: "#2577e3", ab: "Trip", min: 100, max: 5000 },
    { id: "iqiyi", n: "爱奇艺 VIP", nEn: "iQIYI VIP", c: "娱乐", cEn: "Fun", bg: "#00be06", ab: "iQIYI", fixed: [30, 88, 248] },
    { id: "didi", n: "滴滴出行券", nEn: "DiDi voucher", c: "出行", cEn: "Travel", bg: "#ff7a29", ab: "DiDi", min: 20, max: 1000 },
    { id: "steamcn", n: "Steam 钱包", nEn: "Steam Wallet", c: "游戏", cEn: "Games", bg: "#1b2838", ab: "Steam", fixed: [50, 100, 200] },
  ],
  NL: [
    { id: "bol", n: "bol.com 礼品卡", nEn: "bol.com card", c: "购物", cEn: "Shopping", bg: "#0000a4", ab: "bol.", min: 5, max: 150 },
    { id: "amznl", n: "Amazon.nl", nEn: "Amazon.nl", c: "购物", cEn: "Shopping", bg: "#232f3e", ab: "amazon", min: 5, max: 500 },
    { id: "steameu", n: "Steam 钱包", nEn: "Steam Wallet", c: "游戏", cEn: "Games", bg: "#1b2838", ab: "Steam", fixed: [5, 10, 25, 50] },
    { id: "netflix", n: "Netflix", nEn: "Netflix", c: "娱乐", cEn: "Fun", bg: "#e50914", ab: "NETFLIX", fixed: [15, 25, 50] },
    { id: "ah", n: "Albert Heijn", nEn: "Albert Heijn", c: "超市", cEn: "Grocery", bg: "#00a0e2", ab: "AH", min: 5, max: 150 },
    { id: "ns", n: "NS 火车卡", nEn: "NS rail card", c: "出行", cEn: "Travel", bg: "#ffc917", ab: "NS", fixed: [10, 20, 50] },
  ],
  US: [
    { id: "amzus", n: "Amazon.com", nEn: "Amazon.com", c: "购物", cEn: "Shopping", bg: "#232f3e", ab: "amazon", min: 1, max: 2000 },
    { id: "apple", n: "Apple 礼品卡", nEn: "Apple gift card", c: "数码", cEn: "Tech", bg: "#555", ab: "Apple", min: 10, max: 500 },
    { id: "steamus", n: "Steam 钱包", nEn: "Steam Wallet", c: "游戏", cEn: "Games", bg: "#1b2838", ab: "Steam", fixed: [5, 10, 20, 50] },
    { id: "uber", n: "Uber", nEn: "Uber", c: "出行", cEn: "Travel", bg: "#000", ab: "Uber", min: 15, max: 500 },
    { id: "target", n: "Target", nEn: "Target", c: "购物", cEn: "Shopping", bg: "#cc0000", ab: "Target", min: 5, max: 500 },
    { id: "spotify", n: "Spotify", nEn: "Spotify", c: "娱乐", cEn: "Fun", bg: "#1db954", ab: "Spotify", fixed: [10, 30, 60] },
  ],
};

/** Prize amount converted into a region currency at the reference rate. */
export function valueIn(prize: number, prizeCur: string, cur: string): number {
  return Math.floor((prize * (FX[prizeCur.toUpperCase()] ?? 1)) / (FX[cur] ?? 1) * 100) / 100;
}

export type CardFit = { ok: boolean; face?: number; note: string };

/** Whether a card can cover the prize value, and at which denomination. */
export function fit(card: GiftCard, v: number, cur: string, lang: "zh" | "en"): CardFit {
  const s = SYM[cur] ?? cur;
  if (card.fixed) {
    const ok = card.fixed.filter((d) => d <= v);
    if (ok.includes(Math.round(v)))
      return { ok: true, face: Math.round(v), note: lang === "zh" ? `固定面额 ${s}${Math.round(v)}` : `Fixed ${s}${Math.round(v)}` };
    return { ok: false, note: lang === "zh" ? `面额 ${card.fixed.map((d) => s + d).join(" / ")}，与奖品不匹配` : `Denominations ${card.fixed.map((d) => s + d).join(" / ")} don't match` };
  }
  if (v < (card.min ?? 0))
    return { ok: false, note: lang === "zh" ? `最低 ${s}${card.min}，奖品价值不足` : `Minimum ${s}${card.min} — prize too small` };
  return { ok: true, face: Math.min(v, card.max ?? v), note: lang === "zh" ? `任意面额 · ${s}${card.min}–${card.max}` : `Any amount · ${s}${card.min}–${card.max}` };
}
