import { describe, expect, it } from "vitest";
import { weekStartUTC, detectPlatform } from "@/lib/plans";
import { runDraw, pickWinners } from "@/lib/draw";
import { computeProgress, parseConditions } from "@/lib/conditions";

import { feeRate, feeAmount } from "@/lib/fees";
describe("tiered fees", () => {
  const tiers = [{ min_amount: 0, rate_percent: 8 }, { min_amount: 500, rate_percent: 6 }, { min_amount: 2000, rate_percent: 4 }];
  it("uses the highest tier reached", () => {
    expect(feeRate(tiers, 100)).toBe(8);
    expect(feeRate(tiers, 500)).toBe(6);
    expect(feeRate(tiers, 5000)).toBe(4);
  });
  it("computes fee on the whole pool", () => expect(feeAmount(tiers, 1000)).toBe(60));
});

describe("quota week", () => {
  it("week resets Monday 00:00 UTC", () => {
    expect(weekStartUTC(new Date("2026-10-28T15:00:00Z")).toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(weekStartUTC(new Date("2026-11-01T23:59:00Z")).toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });
});

describe("verifiable draw", () => {
  const cands = Array.from({ length: 10 }, (_, i) => ({ id: `id${i}`, handle: `@u${i}` }));
  it("is deterministic for the same list and time", async () => {
    const a = await runDraw(cands, "2026-10-27T00:00:00.000Z", 3);
    const b = await runDraw([...cands].reverse(), "2026-10-27T00:00:00.000Z", 3);
    expect(a).toEqual(b);
  });
  it("picks unique winners, capped at candidate count", async () => {
    const w = await pickWinners(cands.slice(0, 2), "seed", 5);
    expect(w.length).toBe(2);
    expect(new Set(w.map((x) => x.id)).size).toBe(2);
  });
});

describe("platform detection", () => {
  it("recognises X and YouTube links", () => {
    expect(detectPlatform("https://x.com/a/status/1")).toBe("x");
    expect(detectPlatform("https://youtu.be/abc")).toBe("youtube");
  });
});

describe("unlock condition progress", () => {
  const conds = parseConditions({ keyword: "giveaway", min_likes: 100, min_participants: 50 });
  it("counts only met conditions toward progress", () => {
    const { progress, checks } = computeProgress(conds, {
      likes: 120, replies: null, reposts: null, keyword_found: true, participants: 30, verified: 0,
    });
    expect(checks).toHaveLength(3);
    expect(progress).toBe(67); // keyword + likes met, participants not
  });
  it("marks unreadable metrics as unknown, not met", () => {
    const { checks, progress } = computeProgress(conds, {
      likes: null, replies: null, reposts: null, keyword_found: null, participants: 60, verified: 0,
    });
    expect(checks.find((c) => c.key === "min_likes")?.state).toBe("unknown");
    expect(progress).toBe(33); // only participants met
  });
  it("empty conditions give zero progress and no checks", () => {
    const { checks, progress } = computeProgress({}, { likes: 5, replies: 5, reposts: 5, keyword_found: true, participants: 5, verified: 5 });
    expect(checks).toHaveLength(0);
    expect(progress).toBe(0);
  });
});

import { endsAtFromDays, CURRENCIES } from "@/lib/plans";
describe("campaign duration & currency", () => {
  it("duration is 1-3 days, capped at 3", () => {
    const now = 0;
    expect(Date.parse(endsAtFromDays(1, now))).toBe(864e5);
    expect(Date.parse(endsAtFromDays(7, now))).toBe(3 * 864e5);
  });
  it("supports five currencies", () => {
    expect([...CURRENCIES]).toEqual(["CNY", "USD", "USDT", "EUR", "GBP"]);
  });
});
