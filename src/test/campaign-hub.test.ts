import { describe, expect, it } from "vitest";
import { campaignBadges, filterHub, hostInitial, simulateCost, periodStart, todayLeader, type HubCampaign } from "@/lib/campaign-hub";
const now = Date.parse("2026-10-28T12:00:00Z");
const campaign = (id: string, values: Partial<HubCampaign> = {}): HubCampaign => ({ id, slug: id, title: id, prize: "", prize_amount: 50, currency: "USDT", winners_count: 2, ends_at: "2026-10-29T12:00:00Z", created_at: "2026-10-28T10:00:00Z", status: "open", escrow_status: "funded", tweet_url: "https://x.com/host/status/1", owner_id: "owner", clicks: 0, ...values });
describe("Campaign hub", () => {
  it("ending soon includes only active campaigns under eight hours", () => {
    expect(filterHub([campaign("soon", { ends_at: "2026-10-28T19:59:59Z" }), campaign("boundary", { ends_at: "2026-10-28T20:00:00Z" }), campaign("expired", { ends_at: "2026-10-28T11:59:00Z" })], "ending", now).map((c) => c.id)).toEqual(["soon"]);
  });
  it("ranks total pools across currencies by USD value", () => {
    // 1000 CNY ≈ 140 USD — outranks a 100 USDT pool but not a 200 USD pool.
    expect(filterHub([campaign("small"), campaign("large", { prize_amount: 100 }), campaign("cny", { prize_amount: 1000, currency: "CNY" }), campaign("usd", { prize_amount: 200, currency: "USD" })], "top", now).map((c) => c.id)).toEqual(["usd", "cny", "large", "small"]);
    expect(filterHub([campaign("small"), campaign("cny", { prize_amount: 1000, currency: "CNY" })], "top", now, "CNY").map((c) => c.id)).toEqual(["cny"]);
  });
  it("draw hall does not imply payment or include undrawn campaigns", () => {
    expect(filterHub([campaign("open"), campaign("drawn", { status: "drawn" })], "drawn", now).map((c) => c.id)).toEqual(["drawn"]);
  });
  it("50 USDT for 500 likes and 500 reposts is 0.05 USDT per interaction", () => {
    expect(simulateCost(50, 500)).toBe(0.05);
  });
  it("badges come only from real data: 80% progress is hot, 1000 USDT is big, under eight hours is ending", () => {
    expect(campaignBadges(campaign("plain"), 79, now)).toEqual([]);
    expect(campaignBadges(campaign("hot"), 80, now)).toEqual(["hot"]);
    expect(campaignBadges(campaign("big", { prize_amount: 1000 }), null, now)).toEqual(["big"]);
    expect(campaignBadges(campaign("big-cny", { prize_amount: 4999, currency: "CNY" }), null, now)).toEqual([]);
    expect(campaignBadges(campaign("big-cny2", { prize_amount: 5000, currency: "CNY" }), null, now)).toEqual(["big"]);
    expect(campaignBadges(campaign("ending", { ends_at: "2026-10-28T13:00:00Z" }), null, now)).toEqual(["ending"]);
    expect(campaignBadges(campaign("ended", { ends_at: "2026-10-28T11:00:00Z" }), 100, now)).toEqual(["hot"]);
  });
  it("host initial falls back to F and uppercases the first letter", () => {
    expect(hostInitial("alpha")).toBe("A");
    expect(hostInitial("  ")).toBe("F");
    expect(hostInitial(null)).toBe("F");
  });
});import { xHandleFromUrl } from "@/lib/campaign-hub";
describe("xHandleFromUrl", () => {
  it("reads the poster's username from a tweet link", () => {
    expect(xHandleFromUrl("https://x.com/JMkernt/status/123")).toBe("JMkernt");
    expect(xHandleFromUrl("https://twitter.com/abc_1/status/9?s=20")).toBe("abc_1");
    expect(xHandleFromUrl("https://x.com/intent/post?text=a")).toBeNull();
    expect(xHandleFromUrl(null)).toBeNull();
  });
});
describe("Sponsor boards", () => {
  const at = Date.parse("2026-10-29T16:00:00Z");
  it("uses UTC calendar month, Monday week and day", () => {
    expect(periodStart(at, "month")).toBe(Date.parse("2026-10-01T00:00:00Z"));
    expect(periodStart(at, "week")).toBe(Date.parse("2026-10-26T00:00:00Z"));
    expect(periodStart(at, "day")).toBe(Date.parse("2026-10-29T00:00:00Z"));
  });
  it("today's leader is the largest pool published today, priced in USD", () => {
    // 500 CNY ≈ 70 USD < 100 USDT, but a 2000 CNY pool ≈ 280 USD would lead.
    expect(todayLeader([campaign("yesterday", { prize_amount: 9999 }), campaign("today", { created_at: "2026-10-29T01:00:00Z", prize_amount: 100 }), campaign("cny", { created_at: "2026-10-29T02:00:00Z", prize_amount: 500, currency: "CNY" })], at)?.id).toBe("today");
    expect(todayLeader([campaign("cny", { created_at: "2026-10-29T02:00:00Z", prize_amount: 2000, currency: "CNY" }), campaign("today", { created_at: "2026-10-29T01:00:00Z", prize_amount: 100 })], at)?.id).toBe("cny");
  });
});
