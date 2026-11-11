import { describe, expect, it } from "vitest";
import { liveImpactRanking, topImpact, xDisplayName } from "@/lib/sponsor-ranking";
import type { HubCampaign } from "@/lib/campaign-hub";

const campaign = (id: string, values: Partial<HubCampaign> = {}): HubCampaign => ({ id, slug: id, title: id, prize: "", prize_amount: 50, currency: "USDT", winners_count: 2, ends_at: "2026-10-29T12:00:00Z", created_at: "2026-10-28T10:00:00Z", status: "open", escrow_status: "funded", tweet_url: null, owner_id: "owner", clicks: 0, ...values });
const snap = (campaign_id: string, fetched_at: string, metrics: unknown) => ({ campaign_id, fetched_at, metrics });
const at = Date.parse("2026-10-29T16:00:00Z");

describe("Impact leaderboard", () => {
  it("separates MirrortekUK's X display name from the handle", () => {
    expect(xDisplayName("MirrortekUK")).toBe("英格兰AI哥");
  });
  it("aggregates per campaign and growth once per handle", () => {
    const campaigns = [
      campaign("a", { tweet_url: "https://x.com/alice/status/1" }),
      campaign("b", { tweet_url: "https://x.com/alice/status/2", created_at: "2026-10-29T10:00:00Z" }),
    ];
    const snaps = [
      snap("a", "2026-10-29T10:00:00Z", { likes: 10, replies: 5, reposts: 2, quotes: 0, bookmarks: 1, views: 1000, followers: 100, author_handle: "alice" }),
      snap("a", "2026-10-29T12:00:00Z", { likes: 20, replies: 8, reposts: 4, quotes: 1, bookmarks: 2, views: 2000, followers: 120, author_handle: "alice" }),
      snap("b", "2026-10-29T13:00:00Z", { likes: 5, replies: 3, reposts: 1, quotes: 0, bookmarks: 0, views: 500, followers: 130, author_handle: "alice" }),
    ];
    const rows = liveImpactRanking(campaigns, snaps, at, "day", new Map());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reach).toBe(2500);
    expect(rows[0]?.engagement).toBe(44);
    // growth = last followers (130) - first followers (100), counted once, not per campaign
    expect(rows[0]?.growth).toBe(30);
    expect(rows[0]?.campaigns).toBe(2);
    expect(rows[0]?.campList.map((cmp) => cmp.slug)).toEqual(["b", "a"]);
  });
  it("counts only the delta above the pre-period baseline", () => {
    const campaigns = [campaign("a", { tweet_url: "https://x.com/alice/status/1" })];
    const snaps = [
      snap("a", "2026-10-28T23:00:00Z", { views: 800, likes: 40, followers: 100, author_handle: "alice" }),
      snap("a", "2026-10-29T12:00:00Z", { views: 2000, likes: 90, followers: 130, author_handle: "alice" }),
    ];
    const rows = liveImpactRanking(campaigns, snaps, at, "day", new Map());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reach).toBe(1200);
    expect(rows[0]?.engagement).toBe(50);
    expect(rows[0]?.growth).toBe(30);
  });
  it("excludes campaigns with no snapshot inside the period", () => {
    const campaigns = [campaign("a", { tweet_url: "https://x.com/alice/status/1" })];
    const snaps = [snap("a", "2026-10-28T10:00:00Z", { views: 5000, author_handle: "alice" })];
    expect(liveImpactRanking(campaigns, snaps, at, "day", new Map())).toHaveLength(0);
  });
  it("missing metrics stay null, not zero", () => {
    const campaigns = [campaign("a", { tweet_url: "https://x.com/bob/status/1" })];
    const snaps = [snap("a", "2026-10-29T12:00:00Z", { likes: 1, replies: 0, reposts: 0, quotes: 0, bookmarks: 0, views: null, followers: null, author_handle: "bob" })];
    const rows = liveImpactRanking(campaigns, snaps, at, "day", new Map());
    expect(rows[0]?.reach).toBeNull();
    expect(rows[0]?.growth).toBeNull();
  });
  it("topImpact sorts by the selected metric and caps at 50", () => {
    const mk = (h: string, views: number) => ({
      c: campaign(h, { tweet_url: `https://x.com/${h}/status/1` }),
      s: snap(h, "2026-10-29T12:00:00Z", { views, likes: 1, replies: 1, reposts: 1, quotes: 0, bookmarks: 0, followers: 10, author_handle: h }),
    });
    const rows = [mk("a", 100), mk("b", 300), mk("c", 200)];
    const ranked = topImpact(liveImpactRanking(rows.map((r) => r.c), rows.map((r) => r.s), at, "day", new Map()), "reach");
    expect(ranked.length).toBeLessThanOrEqual(50);
    expect(ranked.map((r) => r.handle)).toEqual(["b", "c", "a"]);
  });
});
