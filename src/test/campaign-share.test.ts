import { describe, it, expect } from "vitest";
import { campaignTweet, shareModel } from "@/lib/campaign-share";

describe("campaign sharing rules", () => {
  const campaign = { title: "社区活动", slug: "sample", prize: "", prize_amount: 40, currency: "USDT", winners_count: 2, share_language: "zh", share_duration: 1, conditions: { min_likes: 100, min_replies: 100, min_reposts: 100, min_verified: 100 } };
  it("splits a 40 USDT pool among 2 winners as 20 USDT each", () => {
    expect(shareModel(campaign).amountEach).toBe(20);
    expect(shareModel(campaign).winners).toBe(2);
  });
  it("retains the Chinese publishing language", () => expect(shareModel(campaign).language).toBe("zh"));
  it("retains the English publishing language", () => expect(shareModel({ ...campaign, share_language: "en" }).language).toBe("en"));
  it("retains the one day campaign duration", () => expect(shareModel(campaign).days).toBe(1));
  it("retains all three separate 100 interaction targets", () => {
    expect(shareModel(campaign).conditions).toMatchObject({ min_likes: 100, min_replies: 100, min_reposts: 100 });
  });
  it("never treats simulated authorization as real prepayment", () => expect(shareModel(campaign).prepaid).toBe(false));
  it("does not claim independent counts prove the same verified users performed all actions", () => expect(shareModel(campaign).sameVerifiedUsersCompletedAllActions).toBe(false));
  it("links to the actual campaign without unsafe slug characters", () => {
    expect(campaignTweet({ ...campaign, slug: "test?x=1" }, "https://example.org/").split("\n").at(-1)).toBe("👉 https://example.org/c/test%3Fx%3D1");
  });
  it("builds the reply-to-win template from the campaign data", () => {
    const tweet = campaignTweet(campaign, "https://example.org");
    expect(tweet).toContain("回贴赢40 USDT");
    expect(tweet).toContain("我们将通过FairDraw平台抽取2位幸运用户，送出40 USDT！");
    expect(tweet).toContain("🎯 目标：达到 100条回复 + 100个点赞 + 100次转发 + 100名蓝V");
    expect(tweet).toContain("⏳ 截止时间：从现在开始后的24小时内");
  });
});