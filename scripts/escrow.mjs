#!/usr/bin/env node
/**
 * FairDrawEscrow toolchain.
 *
 *   node scripts/escrow.mjs compile          → writes artifacts/FairDrawEscrow.json
 *   node scripts/escrow.mjs deploy           → deploys via DEPLOYER_KEY, prints address
 *
 * Deploy env (read from .env.local if present):
 *   DEPLOYER_KEY        private key of the deployer (also becomes owner)
 *   CHAIN_RPC_URL       RPC endpoint (default: BSC mainnet)
 *   CHAIN_ID            56 (default) or 97 for testnet
 *   USDT_TOKEN          pool token (default: BSC USDT 0x55d3...7955)
 *   ORACLE_ADDRESS      backend signer allowed to resolve()/pay() (default: deployer)
 *   FEE_RECIPIENT       platform wallet receiving the fee split (default: deployer)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc, bscTestnet } from "viem/chains";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = resolve(root, "contracts/FairDrawEscrow.sol");
const artPath = resolve(root, "artifacts/FairDrawEscrow.json");

// Load .env.local without a dotenv dependency.
const envFile = resolve(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

function compile() {
  const input = {
    language: "Solidity",
    sources: { "FairDrawEscrow.sol": { content: readFileSync(srcPath, "utf8") } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors ?? []).filter((e) => e.severity === "error");
  for (const e of out.errors ?? []) console.error(e.formattedMessage);
  if (errors.length) process.exit(1);
  const c = out.contracts["FairDrawEscrow.sol"].FairDrawEscrow;
  mkdirSync(dirname(artPath), { recursive: true });
  writeFileSync(artPath, JSON.stringify({ abi: c.abi, bytecode: c.evm.bytecode.object }, null, 2));
  console.log(`compiled → ${artPath} (${Math.round(c.evm.bytecode.object.length / 2)} bytes)`);
}

async function deploy() {
  const key = process.env.DEPLOYER_KEY;
  if (!key) { console.error("DEPLOYER_KEY required"); process.exit(1); }
  if (!existsSync(artPath)) compile();
  const { abi, bytecode } = JSON.parse(readFileSync(artPath, "utf8"));

  const chainId = Number(process.env.CHAIN_ID ?? 56);
  const chain = chainId === 97 ? bscTestnet : bsc;
  const rpc = process.env.CHAIN_RPC_URL ?? (chainId === 97 ? "https://bsc-testnet.public.blastapi.io" : "https://bsc-dataseed.binance.org");
  const token = process.env.USDT_TOKEN ?? "0x55d398326f99059fF775485246999027B3197955";
  const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
  const oracle = process.env.ORACLE_ADDRESS ?? account.address;
  const feeRecipient = process.env.FEE_RECIPIENT ?? process.env.VITE_PLATFORM_WALLET ?? account.address;

  const pub = createPublicClient({ chain, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });
  console.log(`deployer=${account.address} chain=${chainId} token=${token} oracle=${oracle} fee=${feeRecipient}`);

  const hash = await wallet.deployContract({ abi, bytecode: `0x${bytecode}`, args: [token, oracle, feeRecipient] });
  console.log(`tx: ${hash}`);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`\nESCROW DEPLOYED: ${receipt.contractAddress}`);
  console.log(`\nNext: set VITE_ESCROW_ADDRESS=${receipt.contractAddress} (public) and redeploy the worker.`);
}

const cmd = process.argv[2];
if (cmd === "compile") compile();
else if (cmd === "deploy") await deploy();
else { console.log("usage: node scripts/escrow.mjs [compile|deploy]"); process.exit(1); }
