import { describe, expect, it } from "vitest";
import { AFF, commissionFor, directCost, maskHandle, refLink, refTweet } from "@/lib/affiliate";

describe("affiliate profit share", () => {
  it("shares NET revenue — fee minus direct costs — never the gross fee", () => {
    // 100 USDT pool, chain rail, 8 USDT fee → cost 0.40 → net 7.60 → share 2.28
    const { cost, net, amount } = commissionFor(100, 8, "chain");
    expect(cost).toBe(0.4);
    expect(net).toBe(7.6);
    expect(amount).toBe(2.28);
    // profit share must be less than a flat 30% of the fee
    expect(amount).toBeLessThan(8 * AFF.share);
  });
  it("stripe rail costs more: acquiring % plus fixed charge", () => {
    const cost = directCost(100, 8, "stripe");
    expect(cost).toBeCloseTo(108 * AFF.stripeRate + AFF.stripeFixed, 2);
    const { net, amount } = commissionFor(100, 8, "stripe");
    expect(net).toBeCloseTo(8 - cost, 2);
    expect(amount).toBeLessThan(2.28); // same fee but higher cost → smaller net share
  });
  it("zero or negative net earns nothing and never goes below zero", () => {
    const { net, amount } = commissionFor(10, 0.2, "stripe");
    expect(net).toBe(0);
    expect(amount).toBe(0);
  });
  it("masks organiser handles", () => {
    expect(maskHandle("mirrortekuk")).toBe("mirr***kuk");
    expect(maskHandle("@zhan88")).toBe("zhan***n88");
    expect(maskHandle("ab")).toBe("a***");
  });
  it("builds the referral link and disclosure tweet", () => {
    const link = refLink("lonzo30");
    expect(link).toBe("https://fairdraw.win/?ref=lonzo30");
    const tweet = refTweet(link);
    expect(tweet).toContain(link);
    expect(tweet).toContain("#广告");
  });
});
