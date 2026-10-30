export type FeeTier = { min_amount: number; rate_percent: number };

/** Tiered fee: the tier with the highest min_amount not above the pool applies to the whole pool. */
export function feeRate(tiers: FeeTier[], amount: number): number {
  const sorted = [...tiers].sort((a, b) => Number(b.min_amount) - Number(a.min_amount));
  return Number(sorted.find((t) => amount >= Number(t.min_amount))?.rate_percent ?? 0);
}

export function feeAmount(tiers: FeeTier[], amount: number): number {
  return Math.round(amount * feeRate(tiers, amount)) / 100;
}
