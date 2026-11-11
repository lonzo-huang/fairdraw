// One-off: run the exact drawCampaign() flow locally with the service key.
// Same writes as src/lib/campaign.functions.ts drawCampaign (mode "all").
// Usage: node scripts/draw-now.mjs <slug>
import { readFileSync } from "node:fs";

const SLUG = process.argv[2] ?? "adce1a72ff";

// ── env (.env then .env.local, local wins) ──
const env = {};
for (const f of [".env", ".env.local"]) {
  try {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"#]+?)"?\s*$/);
      if (m) env[m[1]] = m[2];
    }
  } catch {}
}
const URL_ = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) throw new Error("missing supabase env");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const api = async (path, init) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, Prefer: "return=representation", ...(init?.headers ?? {}) } });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${path}: ${JSON.stringify(body)}`);
  return body;
};

// ── draw.ts (verbatim port — must stay identical so results recompute) ──
const hex = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, "0")).join("");
const canonical = (cs) => [...cs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((c) => `${c.id}:${c.handle}`).join("\n");
const runDraw = async (candidates, drawnAtIso, count) => {
  const hash = await hex(canonical(candidates));
  const seed = await hex(`${hash}|${drawnAtIso}`);
  const pool = [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const winners = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const h = await hex(`${seed}:${i}`);
    const j = i + (parseInt(h.slice(0, 12), 16) % (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    winners.push(pool[i]);
  }
  return { listHash: hash, seed, winners };
};
const tweetDeleted = async (url) => {
  try {
    const r = await fetch(`https://publish.twitter.com/oembed?omit_script=true&url=${encodeURIComponent(url)}`, { headers: { "User-Agent": "FairDrawBot/1.0" } });
    return !r.ok ? true : null; // 404 → deleted; 200 → exists; else unknown
  } catch { return null; }
};

// ── drawCampaign handler equivalent ──
const [c] = await api(`campaigns?slug=eq.${SLUG}&select=id,slug,status,winners_count`);
if (!c) throw new Error("Campaign not found");
if (c.status !== "open") throw new Error(c.status === "drawn" ? "Already drawn" : "Campaign is cancelled");

const [camp] = await api(`campaigns?id=eq.${c.id}&select=prize_amount,escrow_status,payment_method`);
if (camp?.prize_amount && (camp.payment_method === "stripe" || camp.payment_method === "chain") && camp.escrow_status === "awaiting")
  throw new Error("Prize pool is not funded yet");
const topup = await api(`payments?campaign_id=eq.${c.id}&kind=eq.topup&status=eq.pending&select=id&limit=1`);
if (topup.length) throw new Error("A pool top-up payment is still pending");

const entries = await api(`entries?campaign_id=eq.${c.id}&eligibility_status=neq.ineligible&select=id,handle,eligibility_status,payout_address,post_url`);
const candidates = entries.map((e) => ({ id: e.id, handle: e.handle }));
if (!candidates.length) throw new Error("No eligible entries");

const drawnAt = new Date().toISOString();
const result = await runDraw(candidates, drawnAt, c.winners_count + 3);
const urlById = new Map(entries.map((e) => [e.id, e.post_url]));
const winners = [];
for (const w of result.winners) {
  if (winners.length >= c.winners_count) break;
  const u = urlById.get(w.id);
  const gone = u ? (await tweetDeleted(u)) === true : false;
  if (!gone) winners.push(w);
}
if (!winners.length) throw new Error("Every drawn reply has been deleted");

await api("draws", { method: "POST", body: JSON.stringify({ campaign_id: c.id, list_hash: result.listHash, seed: result.seed, drawn_at: drawnAt, candidates, winners }) });
await api(`campaigns?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify({ status: "drawn", escrow_status: "charged", draw_mode: "all", draw_weights: null }) });
const addr = new Map(entries.map((e) => [e.handle, e.payout_address]));
await api("payouts", { method: "POST", body: JSON.stringify(winners.map((w) => ({ campaign_id: c.id, winner_handle: w.handle, wallet_address: addr.get(w.handle) ?? null }))) });

// escrowResolve skipped: CHAIN_PAYOUT_KEY lives only on the worker; first claim retries it lazily.
console.log(JSON.stringify({ ok: true, slug: SLUG, drawnAt, winners: winners.map((w) => w.handle), listHash: result.listHash }, null, 2));
