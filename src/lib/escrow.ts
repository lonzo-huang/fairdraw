/**
 * Shared FairDrawEscrow helpers — isomorphic (browser + server).
 * The contract locks organizer-funded pools; the oracle (backend signer)
 * commits winner shares and relays winner-chosen payout addresses.
 */
import { keccak256, stringToHex } from "viem";

export const ESCROW_ABI = [
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "pool", type: "uint256" },
      { name: "fee", type: "uint256" },
      { name: "cancelAfter", type: "uint64" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "shares", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "pay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "idx", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "campaigns",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [
      { name: "funder", type: "address" },
      { name: "pool", type: "uint256" },
      { name: "cancelAfter", type: "uint64" },
      { name: "resolved", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "paid",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "bytes32" },
      { name: "idx", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "Deposited",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "funder", type: "address", indexed: true },
      { name: "pool", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
      { name: "cancelAfter", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Refunded",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "funder", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Paid",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "idx", type: "uint256", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

/**
 * On-chain campaign key: keccak256 of the campaign UUID string. Deterministic
 * so the frontend encodes `fund` calldata and the backend verifies `Deposited`
 * for the same id without any extra storage.
 */
export function escrowCampaignId(campaignId: string): `0x${string}` {
  return keccak256(stringToHex(campaignId));
}

/**
 * Splits `poolUnits` into `n` winner shares; the last share absorbs the
 * remainder so sum(shares) === poolUnits exactly (no locked dust).
 */
export function splitShares(poolUnits: bigint, n: number): bigint[] {
  if (n <= 0) return [];
  const q = poolUnits / BigInt(n);
  const r = poolUnits % BigInt(n);
  const out = Array<bigint>(n).fill(q);
  out[n - 1] = q + r;
  return out;
}
