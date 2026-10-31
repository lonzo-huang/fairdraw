/**
 * Browser-side MetaMask helpers. No wallet SDK — talks to window.ethereum
 * directly and uses viem only to encode calldata.
 */
import { encodeFunctionData, parseAbiItem, parseUnits } from "viem";
import { chainConfig } from "@/lib/payments";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
      on?: (event: string, cb: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

const ERC20_TRANSFER = parseAbiItem("function transfer(address to, uint256 amount) returns (bool)");

export function hasEthereum(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

/** Prompts the injected browser wallet (any EIP-1193 provider) for accounts. */
export async function connectWallet(): Promise<`0x${string}`> {
  if (!window.ethereum) throw new Error("Browser wallet not detected");
  const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.[0]) throw new Error("No wallet account");
  return accounts[0] as `0x${string}`;
}

/** Switches (or adds) the configured chain in the injected wallet. */
export async function ensureChain(): Promise<void> {
  if (!window.ethereum) throw new Error("Browser wallet not detected");
  const cfg = chainConfig();
  const hex = `0x${cfg.chainId.toString(16)}`;
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (e) {
    // 4902 = chain not added yet.
    if ((e as { code?: number })?.code !== 4902) throw e;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hex,
          chainName: cfg.chainId === 56 ? "BNB Smart Chain" : `Chain ${cfg.chainId}`,
          nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
          rpcUrls: ["https://bsc-dataseed.binance.org"],
          blockExplorerUrls: cfg.chainId === 56 ? ["https://bscscan.com"] : [],
        },
      ],
    });
  }
}

/** Sends an ERC-20 transfer from the connected wallet account. */
export async function sendTokenTransfer(to: `0x${string}`, amount: number): Promise<`0x${string}`> {
  const cfg = chainConfig();
  const from = await connectWallet();
  await ensureChain();
  const data = encodeFunctionData({
    abi: [ERC20_TRANSFER],
    functionName: "transfer",
    args: [to, parseUnits(String(amount), cfg.tokenDecimals)],
  });
  return (await window.ethereum!.request({
    method: "eth_sendTransaction",
    params: [{ from, to: cfg.tokenAddress, data, value: "0x0" }],
  })) as `0x${string}`;
}

/** Asks MetaMask to sign a proof-of-ownership message. */
export async function signWalletMessage(address: string): Promise<{ message: string; signature: string }> {
  if (!window.ethereum) throw new Error("MetaMask not detected");
  const message = `FairDraw wallet link: I own ${address}. Nonce: ${crypto.randomUUID()}`;
  const signature = (await window.ethereum.request({
    method: "personal_sign",
    params: [message, address],
  })) as string;
  return { message, signature };
}
