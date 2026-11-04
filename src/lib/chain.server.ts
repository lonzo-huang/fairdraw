/**
 * Server-only on-chain verification for MetaMask/EVM payments.
 * Reads transaction receipts over a public JSON-RPC endpoint and decodes
 * ERC-20 Transfer events — no private keys are ever needed or stored.
 */
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  formatUnits,
  getAddress,
  http,
  parseAbiItem,
  parseUnits,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chainConfig } from "@/lib/payments";
import { ESCROW_ABI, escrowCampaignId, splitShares } from "@/lib/escrow";

const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

function evmChain() {
  const cfg = chainConfig();
  return defineChain({
    id: cfg.chainId,
    name: `chain-${cfg.chainId}`,
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: { default: { http: [process.env["CHAIN_RPC_URL"] ?? defaultRpc(cfg.chainId)] } },
  });
}

function defaultRpc(chainId: number): string {
  if (chainId === 56) return "https://bsc-dataseed.binance.org";
  if (chainId === 97) return "https://bsc-testnet.public.blastapi.io";
  if (chainId === 1) return "https://ethereum-rpc.publicnode.com";
  return "https://ethereum-rpc.publicnode.com";
}

export function chainClient() {
  return createPublicClient({ chain: evmChain(), transport: http() });
}

export type TransferMatch = {
  from: Address;
  to: Address;
  /** Amount in human token units, e.g. "25.5" USDT. */
  amount: string;
};

/**
 * Verifies a transaction is a successful ERC-20 transfer on the configured
 * token contract. Returns the first Transfer event matching `to` (or all
 * transfers when `to` is omitted). Amounts are in token units.
 */
export async function verifyTokenTransfer(
  txHash: `0x${string}`,
  expectedTo?: Address,
  minAmount?: number,
): Promise<TransferMatch> {
  const cfg = chainConfig();
  const client = chainClient();
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  if (!receipt) throw new Error("Transaction not found — it may still be pending, retry in a few seconds");
  if (receipt.status !== "success") throw new Error("Transaction failed on-chain");

  const minUnits = minAmount !== undefined ? parseUnits(String(minAmount), cfg.tokenDecimals) : 0n;
  const wanted = expectedTo ? getAddress(expectedTo) : null;

  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(cfg.tokenAddress)) continue;
    try {
      const decoded = decodeEventLog({ abi: [TRANSFER_EVENT], data: log.data, topics: log.topics });
      if (decoded.eventName !== "Transfer") continue;
      const { from, to, value } = decoded.args as { from: Address; to: Address; value: bigint };
      if (wanted && getAddress(to) !== wanted) continue;
      if (value < minUnits) continue;
      return { from, to, amount: formatUnits(value, cfg.tokenDecimals) };
    } catch {
      continue;
    }
  }
  throw new Error(
    wanted
      ? `No ${cfg.tokenSymbol} transfer to ${wanted} of at least ${minAmount} found in this transaction`
      : `No ${cfg.tokenSymbol} transfer found in this transaction`,
  );
}

export function isValidAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

const ERC20_TRANSFER = parseAbiItem("function transfer(address to, uint256 amount) returns (bool)");

/**
 * Oracle wallet client — CHAIN_PAYOUT_KEY signs resolve()/pay() calls on the
 * escrow contract. It needs BNB for gas only; the contract never lets it hold
 * or move USDT beyond committed winner shares. Legacy (pre-escrow) pools still
 * use it for direct transfers via sendTokenPayout.
 */
function oracleWallet() {
  const key = process.env["CHAIN_PAYOUT_KEY"];
  if (!key) throw new Error("On-chain payouts are not configured");
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`);
  return createWalletClient({ account, chain: evmChain(), transport: http() });
}

/**
 * Sends a prize payout in the configured token from the platform hot wallet.
 * Legacy path for pools funded directly to the platform wallet before the
 * escrow contract existed. Returns the tx hash once the node accepts it.
 */
export async function sendTokenPayout(to: `0x${string}`, amount: number): Promise<`0x${string}`> {
  const cfg = chainConfig();
  return oracleWallet().writeContract({
    address: cfg.tokenAddress,
    abi: [ERC20_TRANSFER],
    functionName: "transfer",
    args: [to, parseUnits(String(amount), cfg.tokenDecimals)],
  });
}

export type EscrowCampaign = { funder: Address; pool: bigint; cancelAfter: bigint; resolved: boolean };

/** On-chain escrow state for a campaign. Null when no deposit exists. */
export async function escrowCampaign(campaignId: string): Promise<EscrowCampaign | null> {
  const cfg = chainConfig();
  if (!cfg.escrowAddress) return null;
  const r = await chainClient().readContract({
    address: cfg.escrowAddress,
    abi: ESCROW_ABI,
    functionName: "campaigns",
    args: [escrowCampaignId(campaignId)],
  });
  const [funder, pool, cancelAfter, resolved] = r as unknown as [Address, bigint, bigint, boolean];
  if (funder === "0x0000000000000000000000000000000000000000") return null;
  return { funder, pool, cancelAfter, resolved };
}

/** Decodes a Deposited event from a funding tx. Returns pool/fee/funder on match. */
export async function verifyEscrowDeposit(
  txHash: `0x${string}`,
  campaignId: string,
  minPool: number,
): Promise<{ funder: Address; pool: string; fee: string }> {
  const cfg = chainConfig();
  if (!cfg.escrowAddress) throw new Error("Escrow is not configured");
  const receipt = await chainClient().getTransactionReceipt({ hash: txHash });
  if (!receipt) throw new Error("Transaction not found — it may still be pending, retry in a few seconds");
  if (receipt.status !== "success") throw new Error("Transaction failed on-chain");

  const wanted = getAddress(cfg.escrowAddress);
  const wantId = escrowCampaignId(campaignId);
  const minPoolUnits = parseUnits(String(minPool), cfg.tokenDecimals);
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== wanted) continue;
    try {
      const decoded = decodeEventLog({ abi: ESCROW_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName !== "Deposited") continue;
      const args = decoded.args as { id: `0x${string}`; funder: Address; pool: bigint; fee: bigint };
      if (args.id !== wantId || args.pool < minPoolUnits) continue;
      return { funder: args.funder, pool: formatUnits(args.pool, cfg.tokenDecimals), fee: formatUnits(args.fee, cfg.tokenDecimals) };
    } catch {
      continue;
    }
  }
  throw new Error(`No escrow deposit of at least ${minPool} ${cfg.tokenSymbol} for this campaign found in the transaction`);
}

/** Decodes a Refunded event proving the pool went back to the funder. */
export async function verifyEscrowRefund(
  txHash: `0x${string}`,
  campaignId: string,
): Promise<{ funder: Address; amount: string }> {
  const cfg = chainConfig();
  if (!cfg.escrowAddress) throw new Error("Escrow is not configured");
  const receipt = await chainClient().getTransactionReceipt({ hash: txHash });
  if (!receipt) throw new Error("Transaction not found — it may still be pending, retry in a few seconds");
  if (receipt.status !== "success") throw new Error("Transaction failed on-chain");

  const wanted = getAddress(cfg.escrowAddress);
  const wantId = escrowCampaignId(campaignId);
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== wanted) continue;
    try {
      const decoded = decodeEventLog({ abi: ESCROW_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName !== "Refunded") continue;
      const args = decoded.args as { id: `0x${string}`; funder: Address; amount: bigint };
      if (args.id !== wantId) continue;
      return { funder: args.funder, amount: formatUnits(args.amount, cfg.tokenDecimals) };
    } catch {
      continue;
    }
  }
  throw new Error("No escrow refund event for this campaign found in the transaction");
}

/**
 * Commits winner shares on-chain after the draw. Idempotent — a second call
 * on an already-resolved campaign is skipped by the caller checking
 * escrowCampaign first.
 */
export async function escrowResolve(campaignId: string, winnerCount: number, poolAmount: number): Promise<`0x${string}`> {
  const cfg = chainConfig();
  if (!cfg.escrowAddress) throw new Error("Escrow is not configured");
  const shares = splitShares(parseUnits(String(poolAmount), cfg.tokenDecimals), winnerCount);
  return oracleWallet().writeContract({
    address: cfg.escrowAddress,
    abi: ESCROW_ABI,
    functionName: "resolve",
    args: [escrowCampaignId(campaignId), shares],
  });
}

/**
 * Pays winner `idx`'s committed share to the address they submitted. The
 * contract enforces the amount and single-payment — the oracle cannot pay
 * more than the share or pay twice.
 */
export async function escrowPay(campaignId: string, idx: number, to: `0x${string}`): Promise<`0x${string}`> {
  const cfg = chainConfig();
  if (!cfg.escrowAddress) throw new Error("Escrow is not configured");
  return oracleWallet().writeContract({
    address: cfg.escrowAddress,
    abi: ESCROW_ABI,
    functionName: "pay",
    args: [escrowCampaignId(campaignId), BigInt(idx), to],
  });
}
