import { describe, expect, it } from "vitest";
import { sampleSponsorRanking, top50, xDisplayName } from "@/lib/sponsor-ranking";

describe("Sponsor rankings", () => {
  it("limits the full ranking to the highest 50 amounts", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ id: String(i), handle: null, name: String(i), amount: i, count: 1, sample: false }));
    expect(top50(rows)).toHaveLength(50);
    expect(top50(rows)[0]?.amount).toBe(59);
    expect(top50(rows)[49]?.amount).toBe(10);
  });
  it("keeps all reference accounts explicitly simulated", () => {
    expect(sampleSponsorRanking("month")).toHaveLength(12);
    expect(sampleSponsorRanking("month").every((r) => r.sample)).toBe(true);
    expect(sampleSponsorRanking("month")[0]?.handle).toBe("xupaopaogm");
  });
  it("separates MirrortekUK's X display name from the handle", () => {
    expect(xDisplayName("MirrortekUK")).toBe("英格兰AI哥");
  });
});