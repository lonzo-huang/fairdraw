import { translate, type Lang } from "@/lib/i18n";
import { parseConditions } from "@/lib/conditions";

export type ShareCampaign = {
  title: string; prize: string; slug: string; winners_count: number;
  prize_amount?: number | null; currency?: string | null;
  share_language?: string; share_duration?: number; conditions?: unknown; requirement?: string;
  escrow_status?: string | null;
};

export function shareModel(c: ShareCampaign) {
  return {
    language: c.share_language === "en" ? "en" as const : "zh" as const,
    winners: Math.max(1, Math.floor(c.winners_count)),
    days: Math.min(3, Math.max(1, c.share_duration ?? 3)),
    amountEach: c.prize_amount && c.prize_amount > 0 ? c.prize_amount / Math.max(1, Math.floor(c.winners_count)) : null,
    conditions: parseConditions(c.conditions),
    // Only real funding states count — "awaiting"/legacy labels are not payment evidence.
    prepaid: c.escrow_status === "funded" || c.escrow_status === "charged",
    sameVerifiedUsersCompletedAllActions: false,
  };
}

export function prizeSummary(c: ShareCampaign, language?: Lang) {
  const m = shareModel(c);
  const lang = language ?? m.language;
  return m.amountEach === null
    ? translate(lang, "share.manualPrize", { prize: c.prize, count: m.winners })
    : translate(lang, "share.prize", { count: m.winners, amount: Number(m.amountEach.toFixed(6)).toString(), currency: c.currency || "USDT" });
}

export function conditionSummary(c: ShareCampaign) {
  const m = shareModel(c);
  const parts: string[] = [];
  const fields = [ ["min_likes", "share.likes"], ["min_replies", "share.replies"], ["min_reposts", "share.reposts"], ["min_participants", "share.participants"], ["min_verified", "share.verified"] ] as const;
  for (const [field, key] of fields) {
    const count = m.conditions[field];
    if (count) parts.push(translate(m.language, key, { count }));
  }
  if (m.conditions.keyword) parts.push(translate(m.language, "share.keyword", { keyword: m.conditions.keyword }));
  return parts.length
    ? translate(m.language, "share.conditions", { days: m.days, conditions: parts.join(m.language === "zh" ? "、" : "; ") })
    : translate(m.language, "share.noConditions", { days: m.days });
}

export function campaignTweet(c: ShareCampaign, origin: string) {
  const m = shareModel(c);
  return [c.title, "", prizeSummary(c), conditionSummary(c),
    ...(c.requirement?.trim() ? [translate(m.language, "share.requirement", { requirement: c.requirement.trim() })] : []),
    translate(m.language, "share.draw", { count: m.winners }),
    translate(m.language, "share.payment"), `${origin.replace(/\/$/, "")}/c/${encodeURIComponent(c.slug)}`].join("\n");
}