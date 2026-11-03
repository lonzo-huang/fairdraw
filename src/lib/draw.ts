// Verifiable draw algorithm. Runs identically on the server (to draw)
// and in the browser (so anyone can re-compute and check a result).

export type Candidate = { id: string; handle: string };

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Canonical candidate list: sorted by entry id, one `id:handle` per line. */
export function canonicalList(candidates: Candidate[]): string {
  return [...candidates]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((c) => `${c.id}:${c.handle}`)
    .join("\n");
}

export async function listHash(candidates: Candidate[]): Promise<string> {
  return sha256Hex(canonicalList(candidates));
}

export async function makeSeed(hash: string, drawnAtIso: string): Promise<string> {
  return sha256Hex(`${hash}|${drawnAtIso}`);
}

/** Deterministic partial Fisher–Yates shuffle driven by a SHA-256 hash chain. */
export async function pickWinners(
  candidates: Candidate[],
  seed: string,
  count: number,
): Promise<Candidate[]> {
  const pool = [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const k = Math.min(count, pool.length);
  const winners: Candidate[] = [];
  for (let i = 0; i < k; i++) {
    const h = await sha256Hex(`${seed}:${i}`);
    const r = parseInt(h.slice(0, 12), 16) % (pool.length - i);
    const j = i + r;
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
    winners.push(pool[i]!);
  }
  return winners;
}

/**
 * Weighted pick without replacement (Efraimidis–Spirakis): score each
 * candidate u_i^(1/w_i) with u_i derived from the seed hash chain and keep
 * the top-k scores. Deterministic given the same list, seed and weights.
 */
export async function pickWinnersWeighted(
  candidates: Candidate[],
  seed: string,
  count: number,
  weightOf: (c: Candidate) => number,
): Promise<Candidate[]> {
  const k = Math.min(count, candidates.length);
  const scored: { c: Candidate; s: number }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    const h = await sha256Hex(`${seed}:${c.id}:${i}`);
    // 48 bits → u in [0,1); power 1/w = ln(key)/w = ln(u)/w.
    const u = parseInt(h.slice(0, 12), 16) / 0xffffffffffff;
    const w = Math.max(1e-6, weightOf(c));
    scored.push({ c, s: Math.log(Math.max(u, 1e-12)) / w });
  }
  scored.sort((a, b) => (a.s > b.s ? -1 : a.s < b.s ? 1 : a.c.id < b.c.id ? -1 : 1));
  return scored.slice(0, k).map((x) => x.c);
}

export async function runDraw(
  candidates: Candidate[],
  drawnAtIso: string,
  count: number,
  weightOf?: (c: Candidate) => number,
) {
  const hash = await listHash(candidates);
  const seed = await makeSeed(hash, drawnAtIso);
  const winners = weightOf
    ? await pickWinnersWeighted(candidates, seed, count, weightOf)
    : await pickWinners(candidates, seed, count);
  return { listHash: hash, seed, winners };
}
