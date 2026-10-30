/**
 * Server-only on-chain verification for MetaMask/EVM payments.
 * Reads transaction receipts over a public JSON-RPC endpoint and decodes
 * ERC-20 Transfer events — no private keys are ever needed or stored.
 */
import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  formatUnits,
  getAddress,
  http,
  parseAbiItem,
  parseUnits,
  type Address,
} from "viem";
import { chainConfig } from "@/lib/payments";

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
