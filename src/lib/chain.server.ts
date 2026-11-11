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
  if (chainId === 8453) return "https://base-rpc.publicnode.com";
  if (chainId === 137) return "https://polygon-bor-rpc.publicnode.com";
  if (chainId === 42161) return "https://arbitrum-one-rpc.publicnode.com";
  return "https://ethereum-rpc.publicnode.com";
}

export function chainClient() {
  return createPublicClient({ chain: evmChain(), transport: http() });
}

/** Public client for an arbitrary accepted chain (funding token side-chains). */
export function chainClientFor(chainId: number) {
  if (chainId === chainConfig().chainId) return chainClient();
  const rpc = process.env[`CHAIN_RPC_URL_${chainId}`] ?? defaultRpc(chainId);
  return createPublicClient({
    chain: defineChain({ id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } }),
    transport: http(),
  });
}

export type TransferMatch = {
  from: Address;
  to: Address;
  /** Amount in human token units, e.g. "25.5" USDT. */
  amount: string;
  /** Symbol of the token contract the transfer was made on, e.g. "USDC". */
  token: string;
  /** Chain the transfer happened on. */
  chainId: number;
  chainName: string;
};

/**
 * Verifies a transaction is a successful ERC-20 transfer on an accepted token
 * contract (primary USDT by default; pass `tokens` to also accept USDC and/or
 * side chains like Base/Polygon). Probes every chain in the token list until
 * the hash resolves. Returns the first Transfer event matching `to` (or all
 * transfers when `to` is omitted). Amounts are in token units.
 */
export async function verifyTokenTransfer(
  txHash: `0x${string}`,
  expectedTo?: Address,
  minAmount?: number,
  tokens?: { chainId: number; chainName: string; address: `0x${string}`; symbol: string; decimals: number }[],
): Promise<TransferMatch> {
  const cfg = chainConfig();
  const accepted = (tokens ?? [{ chainId: cfg.chainId, chainName: cfg.chainName, address: cfg.tokenAddress, symbol: cfg.tokenSymbol, decimals: cfg.tokenDecimals }])
    .map((t) => ({ ...t, addr: getAddress(t.address) }));
  const wanted = expectedTo ? getAddress(expectedTo) : null;
  const chainIds = [...new Set(accepted.map((t) => t.chainId))];

  let sawFailed = false;
  for (const chainId of chainIds) {
    let receipt;
    try {
      receipt = await chainClientFor(chainId).getTransactionReceipt({ hash: txHash });
    } catch {
      continue; // hash doesn't exist on this chain
    }
    if (!receipt) continue;
    if (receipt.status !== "success") { sawFailed = true; continue; }

    const onChain = accepted.filter((t) => t.chainId === chainId);
    for (const log of receipt.logs) {
      const token = onChain.find((t) => t.addr === getAddress(log.address));
      if (!token) continue;
      try {
        const decoded = decodeEventLog({ abi: [TRANSFER_EVENT], data: log.data, topics: log.topics });
        if (decoded.eventName !== "Transfer") continue;
        const { from, to, value } = decoded.args as { from: Address; to: Address; value: bigint };
        if (wanted && getAddress(to) !== wanted) continue;
        const minUnits = minAmount !== undefined ? parseUnits(String(minAmount), token.decimals) : 0n;
        if (value < minUnits) continue;
        return { from, to, amount: formatUnits(value, token.decimals), token: token.symbol, chainId, chainName: token.chainName };
      } catch {
        continue;
      }
    }
    // Receipt exists on this chain but no matching transfer — the hash is
    // real, so a wrong-token/wrong-recipient error is more useful than
    // "not found" from probing the rest.
    const symbols = onChain.map((t) => t.symbol).join(" or ");
    throw new Error(
      wanted
        ? `No ${symbols} transfer to ${wanted} of at least ${minAmount} found in this transaction on ${onChain[0]?.chainName}`
        : `No ${symbols} transfer found in this transaction on ${onChain[0]?.chainName}`,
    );
  }
  if (sawFailed) throw new Error("Transaction failed on-chain");
  throw new Error("Transaction not found — it may still be pending, retry in a few seconds");
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

/** Oracle account = platform treasury: receives released shares for fiat claims. */
export function oracleAddress(): `0x${string}` {
  return oracleWallet().account.address;
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

const ERC20_APPROVE = parseAbiItem("function approve(address spender, uint256 amount) returns (bool)");

/**
 * Walletless funding: the organizer sent pool+fee to the treasury (oracle
 * wallet) from an exchange; the oracle approves the escrow contract and calls
 * fund() so the pool still locks on-chain. The treasury becomes the recorded
 * funder — refunds return here and the platform forwards them to the
 * organizer off-band. Waits for the fund receipt and returns its hash.
 */
export async function oracleFundEscrow(
  campaignId: string,
  pool: number,
  fee: number,
  cancelAfterSec: number,
): Promise<`0x${string}`> {
  const cfg = chainConfig();
  if (!cfg.escrowAddress) throw new Error("Escrow is not configured");
  const wallet = oracleWallet();
  const total = parseUnits(String(pool + fee), cfg.tokenDecimals);
  const approveTx = await wallet.writeContract({
    address: cfg.tokenAddress,
    abi: [ERC20_APPROVE],
    functionName: "approve",
    args: [cfg.escrowAddress, total],
  });
  await chainClient().waitForTransactionReceipt({ hash: approveTx });
  const fundTx = await wallet.writeContract({
    address: cfg.escrowAddress,
    abi: ESCROW_ABI,
    functionName: "fund",
    args: [escrowCampaignId(campaignId), parseUnits(String(pool), cfg.tokenDecimals), parseUnits(String(fee), cfg.tokenDecimals), BigInt(cancelAfterSec)],
  });
  await chainClient().waitForTransactionReceipt({ hash: fundTx });
  return fundTx;
}
