import { describe, expect, it } from "vitest";
import { liveImpactRanking, topImpact } from "@/lib/sponsor-ranking";
import type { HubCampaign } from "@/lib/campaign-hub";

const campaign = (id: string, values: Partial<HubCampaign> = {}): HubCampaign => ({ id, slug: id, title: id, prize: "", prize_amount: 50, currency: "USDT", winners_count: 2, ends_at: "2026-10-29T12:00:00Z", created_at: "2026-10-28T10:00:00Z", status: "open", escrow_status: "funded", tweet_url: null, owner_id: "owner", clicks: 0, ...values });
const snap = (campaign_id: string, fetched_at: string, metrics: unknown) => ({ campaign_id, fetched_at, metrics });
const at = Date.parse("2026-10-29T16:00:00Z");

describe("Impact leaderboard", () => {
  it("prefers the snapshot's real author_name for display", () => {
    const campaigns = [campaign("a", { tweet_url: "https://x.com/alice/status/1", created_at: "2026-10-29T10:00:00Z" })];
    const snaps = [snap("a", "2026-10-29T12:00:00Z", { views: 100, likes: 1, followers: 10, author_handle: "alice", author_name: "Alice 🚀" })];
    const rows = liveImpactRanking(campaigns, snaps, at, "day", new Map());
    expect(rows[0]?.name).toBe("Alice 🚀");
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
    // Cumulative: a latest views 2000 + b latest views 500 = 2500
    expect(rows[0]?.reach).toBe(2500);
    // a latest eng 20+8+4+1+2=35 + b latest 5+3+1+0+0=9 = 44
    expect(rows[0]?.engagement).toBe(44);
    // followers = latest account reading (b's 130), counted once, not per campaign
    expect(rows[0]?.growth).toBe(130);
    expect(rows[0]?.campaigns).toBe(2);
    expect(rows[0]?.campList.map((cmp) => cmp.slug)).toEqual(["b", "a"]);
  });
  it("pre-period snapshots are ignored — the board shows the latest in-period total", () => {
    const campaigns = [campaign("a", { tweet_url: "https://x.com/alice/status/1" })];
    const snaps = [
      snap("a", "2026-10-28T23:00:00Z", { views: 800, likes: 40, followers: 100, author_handle: "alice" }),
      snap("a", "2026-10-29T12:00:00Z", { views: 2000, likes: 90, followers: 130, author_handle: "alice" }),
    ];
    const rows = liveImpactRanking(campaigns, snaps, at, "day", new Map());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reach).toBe(2000);
    expect(rows[0]?.engagement).toBe(90);
    expect(rows[0]?.growth).toBe(130);
  });
  it("a single in-period snapshot reports its cumulative total, matching the campaign page", () => {
    const campaigns = [campaign("a", { tweet_url: "https://x.com/alice/status/1" })];
    const snaps = [snap("a", "2026-10-29T12:00:00Z", { views: 5000, likes: 90, followers: 200, author_handle: "alice" })];
    const rows = liveImpactRanking(campaigns, snaps, at, "day", new Map());
    expect(rows[0]?.reach).toBe(5000);
    expect(rows[0]?.engagement).toBe(90);
    expect(rows[0]?.growth).toBe(200);
  });
  it("the board uses the latest in-period reading — same number the campaign page shows", () => {
    const campaigns = [campaign("a", { tweet_url: "https://x.com/alice/status/1", created_at: "2026-10-29T09:00:00Z" })];
    const snaps = [
      snap("a", "2026-10-29T12:00:00Z", { views: 23_500_000, likes: 9000, followers: 200, author_handle: "alice" }),
      snap("a", "2026-10-29T13:00:00Z", { views: 23_510_000, likes: 9100, followers: 260, author_handle: "alice" }),
    ];
    const rows = liveImpactRanking(campaigns, snaps, at, "day", new Map());
    expect(rows[0]?.reach).toBe(23_510_000);
    expect(rows[0]?.engagement).toBe(9100);
    expect(rows[0]?.growth).toBe(260);
  });
  it("excludes campaigns with no snapshot inside the period", () => {
    const campaigns = [campaign("a", { tweet_url: "https://x.com/alice/status/1" })];
    const snaps = [snap("a", "2026-10-28T10:00:00Z", { views: 5000, author_handle: "alice" })];
    expect(liveImpactRanking(campaigns, snaps, at, "day", new Map())).toHaveLength(0);
  });
  it("missing metrics stay null, not zero", () => {
    const campaigns = [campaign("a", { tweet_url: "https://x.com/bob/status/1", created_at: "2026-10-29T10:00:00Z" })];
    const snaps = [snap("a", "2026-10-29T12:00:00Z", { likes: 1, replies: 0, reposts: 0, quotes: 0, bookmarks: 0, views: null, followers: null, author_handle: "bob" })];
    const rows = liveImpactRanking(campaigns, snaps, at, "day", new Map());
    expect(rows[0]?.reach).toBeNull();
    expect(rows[0]?.growth).toBeNull();
  });
  it("topImpact sorts by the selected metric and caps at 50", () => {
    const mk = (h: string, views: number) => ({
      c: campaign(h, { tweet_url: `https://x.com/${h}/status/1`, created_at: "2026-10-29T10:00:00Z" }),
      s: [
        snap(h, "2026-10-29T11:00:00Z", { views: views / 2, likes: 0, replies: 0, reposts: 0, quotes: 0, bookmarks: 0, followers: 10, author_handle: h }),
        snap(h, "2026-10-29T12:00:00Z", { views, likes: 1, replies: 1, reposts: 1, quotes: 0, bookmarks: 0, followers: 10, author_handle: h }),
      ],
    });
    const rows = [mk("a", 100), mk("b", 300), mk("c", 200)];
    const ranked = topImpact(liveImpactRanking(rows.map((r) => r.c), rows.flatMap((r) => r.s), at, "day", new Map()), "reach");
    expect(ranked.length).toBeLessThanOrEqual(50);
    expect(ranked.map((r) => r.handle)).toEqual(["b", "c", "a"]);
  });
});
