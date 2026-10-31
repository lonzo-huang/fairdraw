/**
 * Payment configuration shared by browser and server.
 * Chain constants are public (receiver address, token contract, chain id).
 * Secrets (Stripe keys, RPC with credentials) stay server-only in process.env.
 */

export type PaymentMethod = "manual" | "stripe" | "chain";
export const PAYMENT_METHODS: PaymentMethod[] = ["manual", "stripe", "chain"];
export const FIAT_CURRENCIES = new Set(["USD", "CNY", "EUR", "GBP"]);

export type ChainConfig = {
  /** EVM chain id as decimal (BSC mainnet = 56). */
  chainId: number;
  /** ERC-20 contract used for pool funding and payouts. */
  tokenAddress: `0x${string}`;
  /** Token decimals (USDT on BSC/Ethereum = 18 / 6 depending on chain). */
  tokenDecimals: number;
  /** Platform wallet that receives pool + fee transfers. */
  receiverAddress: `0x${string}` | null;
  /** Public block explorer base URL for tx links. */
  explorerTx: string;
  /** Symbol shown to users, e.g. USDT. */
  tokenSymbol: string;
};

const CHAIN_DEFAULTS: Record<number, Pick<ChainConfig, "explorerTx" | "tokenSymbol" | "tokenDecimals">> = {
  56: { explorerTx: "https://bscscan.com/tx/", tokenSymbol: "USDT", tokenDecimals: 18 },
  97: { explorerTx: "https://testnet.bscscan.com/tx/", tokenSymbol: "USDT", tokenDecimals: 18 },
  1: { explorerTx: "https://etherscan.io/tx/", tokenSymbol: "USDT", tokenDecimals: 6 },
};

/** Public chain config. Env-overridable so staging can point at a testnet. */
export function chainConfig(): ChainConfig {
  const env = typeof import.meta !== "undefined" ? import.meta.env : ({} as Record<string, string | undefined>);
  const chainId = Number(env.VITE_CHAIN_ID ?? 56) || 56;
  const defaults = CHAIN_DEFAULTS[chainId] ?? { explorerTx: "", tokenSymbol: "USDT", tokenDecimals: 18 };
  return {
    chainId,
    tokenAddress: (env.VITE_USDT_TOKEN ?? "0x55d398326f99059fF775485246999027B3197955") as `0x${string}`,
    tokenDecimals: Number(env.VITE_USDT_DECIMALS ?? defaults.tokenDecimals) || defaults.tokenDecimals,
    receiverAddress: (env.VITE_PLATFORM_WALLET || null) as `0x${string}` | null,
    explorerTx: defaults.explorerTx,
    tokenSymbol: env.VITE_TOKEN_SYMBOL ?? defaults.tokenSymbol,
  };
}

/** Stripe needs minor units (cents). Returns null for zero/negative amounts. */
export function toMinorUnits(amount: number): number | null {
  const units = Math.round(amount * 100);
  return units > 0 ? units : null;
}

/** Stripe Checkout supports fiat; USDT pools are charged at par in USD. */
export function stripeSupports(currency: string): boolean {
  const c = currency.toUpperCase();
  return FIAT_CURRENCIES.has(c) || c === "USDT";
}

/** Currency Stripe actually charges: fiat as-is, USDT billed in USD at 1:1. */
export function stripeChargeCurrency(currency: string): string {
  return currency.toUpperCase() === "USDT" ? "usd" : currency.toLowerCase();
}
