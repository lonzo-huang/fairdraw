import { readFileSync } from "node:fs";

// .env.local overrides .env
const env = {};
for (const f of [".env", ".env.local"]) {
  try {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"#]+?)"?\s*$/);
      if (m) env[m[1]] = m[2];
    }
  } catch { /* missing file */ }
}
const BASE = env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) throw new Error("missing SUPABASE env");
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const del = await fetch(`${BASE}/rest/v1/fee_tiers?id=not.is.null`, { method: "DELETE", headers });
if (!del.ok) throw new Error(`delete: ${del.status} ${await del.text()}`);

const rows = [
  { min_amount: 0, rate_percent: 20 },
  { min_amount: 5, rate_percent: 12 },
  { min_amount: 50, rate_percent: 10 },
  { min_amount: 100, rate_percent: 8 },
  { min_amount: 500, rate_percent: 6 },
  { min_amount: 1000, rate_percent: 5 },
];
const ins = await fetch(`${BASE}/rest/v1/fee_tiers`, { method: "POST", headers, body: JSON.stringify(rows) });
if (!ins.ok) throw new Error(`insert: ${ins.status} ${await ins.text()}`);

const check = await (await fetch(`${BASE}/rest/v1/fee_tiers?select=min_amount,rate_percent&order=min_amount`, { headers })).json();
console.log(check);
