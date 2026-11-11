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
  /** Platform wallet that receives pool + fee transfers (legacy / fee split). */
  receiverAddress: `0x${string}` | null;
  /** FairDrawEscrow contract that locks pools. Null = pre-escrow deployment. */
  escrowAddress: `0x${string}` | null;
  /** Oracle/treasury wallet — walletless organizers send USDT here; the oracle wraps it into escrow. */
  treasuryAddress: `0x${string}` | null;
  /** Public block explorer base URL for tx links. */
  explorerTx: string;
  /** Symbol shown to users, e.g. USDT. */
  tokenSymbol: string;
  /** Human-readable network name, e.g. "BNB Smart Chain". */
  chainName: string;
};

const CHAIN_DEFAULTS: Record<number, Pick<ChainConfig, "explorerTx" | "tokenSymbol" | "tokenDecimals" | "chainName">> = {
  56: { explorerTx: "https://bscscan.com/tx/", tokenSymbol: "USDT", tokenDecimals: 18, chainName: "BNB Smart Chain" },
  97: { explorerTx: "https://testnet.bscscan.com/tx/", tokenSymbol: "USDT", tokenDecimals: 18, chainName: "BSC Testnet" },
  1: { explorerTx: "https://etherscan.io/tx/", tokenSymbol: "USDT", tokenDecimals: 6, chainName: "Ethereum" },
};

/** Public chain config. Env-overridable so staging can point at a testnet. */
export function chainConfig(): ChainConfig {
  const env = typeof import.meta !== "undefined" ? import.meta.env : ({} as Record<string, string | undefined>);
  const chainId = Number(env["VITE_CHAIN_ID"] ?? 56) || 56;
  const defaults = CHAIN_DEFAULTS[chainId] ?? { explorerTx: "", tokenSymbol: "USDT", tokenDecimals: 18, chainName: `EVM ${chainId}` };
  return {
    chainId,
    tokenAddress: (env["VITE_USDT_TOKEN"] ?? "0x55d398326f99059fF775485246999027B3197955") as `0x${string}`,
    tokenDecimals: Number(env["VITE_USDT_DECIMALS"] ?? defaults.tokenDecimals) || defaults.tokenDecimals,
    receiverAddress: (env["VITE_PLATFORM_WALLET"] || null) as `0x${string}` | null,
    escrowAddress: (env["VITE_ESCROW_ADDRESS"] || null) as `0x${string}` | null,
    treasuryAddress: ((env["VITE_TREASURY_ADDRESS"] || env["VITE_PLATFORM_WALLET"]) || null) as `0x${string}` | null,
    explorerTx: defaults.explorerTx,
    tokenSymbol: env["VITE_TOKEN_SYMBOL"] ?? defaults.tokenSymbol,
    chainName: env["VITE_CHAIN_NAME"] ?? defaults.chainName,
  };
}

export type FundingToken = { chainId: number; chainName: string; address: `0x${string}`; symbol: string; decimals: number };

/** Native USDC contracts on the extra chains OKX etc. can withdraw to. */
const USDC_BY_CHAIN: Record<number, { address: `0x${string}`; decimals: number; name: string }> = {
  56: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18, name: "BNB Chain" }, // Binance-Peg USDC
  8453: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, name: "Base" },
  137: { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6, name: "Polygon" },
  42161: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6, name: "Arbitrum" },
  196: { address: "0xB6CEceAB302E2E4948951eE7843FC24E92933061", decimals: 6, name: "X Layer" }, // Circle native USDC (OKX withdrawals settle this)
};
/** Legacy bridged USDC on X Layer — accepted too in case a sender holds the pre-native tokens. */
const XLAYER_BRIDGED_USDC = ["0x74b7f16337b8972027f6196a17a631ac6de26d22", "0xa8ce8aee21bc2a48a5ef670afcc9274c7bbbc035"] as const;

/**
 * ERC-20 tokens accepted for pool funding. Escrow and winner payouts stay in
 * the primary token (USDT on BSC): extra tokens (USDC — the only compliant
 * stablecoin on EU-regulated exchanges post-MiCA) land in the treasury on
 * whichever chain the sender used, and the oracle wraps its own USDT float
 * into the escrow contract. The treasury EOA address is identical on every
 * EVM chain, so one QR/address serves all accepted networks.
 */
export function fundingTokens(): FundingToken[] {
  const env = typeof import.meta !== "undefined" ? import.meta.env : ({} as Record<string, string | undefined>);
  const cfg = chainConfig();
  const tokens: FundingToken[] = [
    { chainId: cfg.chainId, chainName: cfg.chainName, address: cfg.tokenAddress, symbol: cfg.tokenSymbol, decimals: cfg.tokenDecimals },
  ];
  if (cfg.chainId !== 56) return tokens; // extra networks only on mainnet
  const usdc56 = USDC_BY_CHAIN[56]!;
  const usdc = env["VITE_USDC_TOKEN"] ?? usdc56.address;
  tokens.push({ chainId: 56, chainName: usdc56.name, address: usdc as `0x${string}`, symbol: env["VITE_USDC_SYMBOL"] ?? "USDC", decimals: Number(env["VITE_USDC_DECIMALS"] ?? usdc56.decimals) || usdc56.decimals });
  for (const chainId of [8453, 137, 42161, 196]) {
    const u = USDC_BY_CHAIN[chainId]!;
    const override = env[`VITE_USDC_TOKEN_${chainId}`];
    tokens.push({ chainId, chainName: u.name, address: (override ?? u.address) as `0x${string}`, symbol: "USDC", decimals: u.decimals });
  }
  for (const bridged of XLAYER_BRIDGED_USDC) {
    tokens.push({ chainId: 196, chainName: "X Layer", address: bridged, symbol: "USDC", decimals: 6 });
  }
  return tokens;
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
