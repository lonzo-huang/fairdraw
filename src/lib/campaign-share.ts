import { translate, type Lang } from "@/lib/i18n";
import { parseConditions } from "@/lib/conditions";

export type ShareCampaign = {
  title: string; prize: string; slug: string; winners_count: number;
  prize_amount?: number | null; currency?: string | null;
  share_language?: string; share_duration?: number; conditions?: unknown; requirement?: string;
  escrow_status?: string | null;
  /** Campaign length in hours (e.g. 24/48/72 or 1 for test campaigns). */
  share_hours?: number; created_at?: string; ends_at?: string;
  /** Demo campaigns declare a pool that is never paid out. */
  is_simulated?: boolean;
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
    : translate(lang, m.winners === 1 ? "share.prizeOne" : "share.prize", { count: m.winners, amount: Number(m.amountEach.toFixed(6)).toString(), currency: c.currency || "USDT" });
}

export function conditionSummary(c: ShareCampaign) {
  const m = shareModel(c);
  const parts: string[] = [];
  const fields = [ ["min_likes", "share.likes"], ["min_replies", "share.replies"], ["min_reposts", "share.reposts"], ["min_quotes", "share.quotes"], ["min_views", "share.views"], ["min_participants", "share.participants"], ["min_verified", "share.verified"] ] as const;
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
  const lang = m.language;
  const amount = c.prize_amount && c.prize_amount > 0 ? `${Number(c.prize_amount.toFixed(6))} ${c.currency || "USDT"}` : c.prize;
  const goalParts: string[] = [];
  const fields = [["min_replies", "share.g.replies"], ["min_likes", "share.g.likes"], ["min_reposts", "share.g.reposts"], ["min_quotes", "share.g.quotes"], ["min_views", "share.g.views"], ["min_participants", "share.g.participants"], ["min_verified", "share.g.verified"]] as const;
  for (const [field, key] of fields) {
    const count = m.conditions[field];
    if (count) goalParts.push(translate(lang, key, { count }));
  }
  if (m.conditions.keyword) goalParts.push(translate(lang, "share.g.keyword", { keyword: m.conditions.keyword }));
  const hours = c.share_hours ?? (c.ends_at && c.created_at ? Math.max(1, Math.round((Date.parse(c.ends_at) - Date.parse(c.created_at)) / 3600e3)) : m.days * 24);
  return [
    translate(lang, "share.head", { amount }),
    translate(lang, "share.draw2", { count: m.winners, amount }),
    translate(lang, "share.howto"),
    ...(goalParts.length ? [translate(lang, "share.goal", { conditions: goalParts.join(" + ") })] : []),
    translate(lang, "share.deadline", { hours }),
    // Demo pools are never escrowed — say so instead of claiming they're prepaid.
    c.is_simulated ? translate(lang, "share.simNote") : translate(lang, "share.prepaid2"),
    translate(lang, "share.luck"),
    `👉 ${origin.replace(/\/$/, "")}/c/${encodeURIComponent(c.slug)}`,
  ].join("\n");
}