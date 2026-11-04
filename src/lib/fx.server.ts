/**
 * Server-only USDT→fiat conversion for cross-currency prize claims.
 * The pool is denominated in the chain token (USDT) but the winner may opt to
 * receive fiat — the escrow share is released to the platform treasury and the
 * winner is paid its fiat equivalent at the quoted rate. The rate is recorded
 * in claim_info so the conversion stays auditable.
 */

/** CoinGecko public price API — no key required, rate-limited but adequate. */
export async function usdtToFiat(targetCurrency: string): Promise<number> {
  const vs = targetCurrency.trim().toLowerCase();
  const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=${vs}`);
  const j = (await r.json().catch(() => null)) as { tether?: Record<string, number> } | null;
  const rate = j?.tether?.[vs];
  if (!rate || rate <= 0) throw new Error(`No USDT→${targetCurrency.toUpperCase()} rate available`);
  return rate;
}
