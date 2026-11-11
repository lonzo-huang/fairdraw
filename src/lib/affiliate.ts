/**
 * Affiliate program constants + profit-share math. Browser-safe — shared by the
 * landing calculator, the member dashboard and the server-side crediting fn.
 *
 * IMPORTANT: the share is on NET revenue (platform fee minus the campaign's own
 * direct costs), never on the fee or the prize pool gross.
 */
export const AFF = {
  /** Referrer share of net revenue. */
  share: 0.3,
  /** Click → signup attribution window (days). */
  attributionDays: 30,
  /** Commissionable period per referral (months). */
  earnMonths: 12,
  /** Pending → confirmed hold after the campaign ends (days). */
  confirmDays: 14,
  /** Minimum monthly payout (USDT); smaller balances roll over. */
  minPayout: 20,
  /** Monthly settlement day-of-month. */
  settleDay: 5,
  /**
   * Direct-cost estimates per funding rail — only costs the campaign itself
   * incurs (no servers, payroll or other opex):
   *  - chain USDT: funding-tx gas + payout gas + winner address screening
   *  - Stripe: acquiring rate + fixed per-charge fee (charge currency unit)
   */
  chainCost: 0.4,
  stripeRate: 0.029,
  stripeFixed: 0.3,
} as const;

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Estimated direct cost of one campaign by funding rail. */
export function directCost(pool: number, fee: number, method: string | null | undefined): number {
  if (method === "stripe") return r2((pool + fee) * AFF.stripeRate + AFF.stripeFixed);
  return AFF.chainCost;
}

/** Net revenue and the referrer's 30% share for one funded campaign. */
export function commissionFor(pool: number, fee: number, method: string | null | undefined) {
  const cost = directCost(pool, fee, method);
  const net = Math.max(0, r2(fee - cost));
  return { cost, net, amount: r2(net * AFF.share) };
}

/** Mask an organiser handle for the referrer dashboard: "mirrortekuk" → "mirr***ruk". */
export function maskHandle(h: string): string {
  const t = h.trim().replace(/^@/, "");
  return t.length <= 4 ? `${t[0] ?? ""}***` : `${t.slice(0, 4)}***${t.slice(-3)}`;
}

export const refLink = (code: string) => `https://fairdraw.win/?ref=${encodeURIComponent(code)}`;

/** Promo tweet template — the #广告/#ad disclosure must stay. */
export const refTweet = (link: string) =>
  `想在 X 上涨粉，又怕抽奖被说是骗局？\n\n我最近在用 @FairDraw：奖金先托管，开奖过程公开可验证，参与者一看就放心 👀\n\n通过我的链接注册试试 👇\n${link}\n\n#广告`;
