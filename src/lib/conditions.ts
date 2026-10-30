/** Campaign unlock conditions and progress computation. Pure logic, shared by browser and server. */

export type Conditions = {
  keyword?: string;
  min_likes?: number;
  min_replies?: number;
  min_reposts?: number;
  min_quotes?: number;
  min_views?: number;
  min_participants?: number;
  min_verified?: number;
};

/** Metrics read from the web or from our own database. null = could not be read. */
export type Metrics = {
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes?: number | null;
  views?: number | null;
  keyword_found: boolean | null;
  participants: number;
  verified: number;
};

export type ConditionCheck = {
  key: keyof Conditions;
  label: string;
  target: string | number;
  current: number | boolean | null;
  /** met = satisfied, unmet = below target, unknown = data unreadable, needs manual review */
  state: "met" | "unmet" | "unknown";
};

export function parseConditions(raw: unknown): Conditions {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && v > 0 ? Math.floor(v) : undefined);
  const out: Conditions = {};
  if (typeof o["keyword"] === "string" && o["keyword"].trim()) out.keyword = o["keyword"].trim();
  const fields = ["min_likes", "min_replies", "min_reposts", "min_quotes", "min_views", "min_participants", "min_verified"] as const;
  for (const k of fields) {
    const v = num(o[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function checkNum(current: number | null | undefined, target: number): ConditionCheck["state"] {
  if (current === null || current === undefined) return "unknown";
  return current >= target ? "met" : "unmet";
}

/** Evaluate every configured condition. Overall progress = met / configured (unknown counts as not met). */
export function computeProgress(conditions: Conditions, metrics: Metrics): { checks: ConditionCheck[]; progress: number } {
  const checks: ConditionCheck[] = [];
  if (conditions.keyword) {
    checks.push({
      key: "keyword",
      label: "keyword",
      target: conditions.keyword,
      current: metrics.keyword_found,
      state: metrics.keyword_found === null ? "unknown" : metrics.keyword_found ? "met" : "unmet",
    });
  }
  if (conditions.min_likes) checks.push({ key: "min_likes", label: "likes", target: conditions.min_likes, current: metrics.likes, state: checkNum(metrics.likes, conditions.min_likes) });
  if (conditions.min_replies) checks.push({ key: "min_replies", label: "replies", target: conditions.min_replies, current: metrics.replies, state: checkNum(metrics.replies, conditions.min_replies) });
  if (conditions.min_reposts) checks.push({ key: "min_reposts", label: "reposts", target: conditions.min_reposts, current: metrics.reposts, state: checkNum(metrics.reposts, conditions.min_reposts) });
  if (conditions.min_quotes) checks.push({ key: "min_quotes", label: "quotes", target: conditions.min_quotes, current: metrics.quotes ?? null, state: checkNum(metrics.quotes, conditions.min_quotes) });
  if (conditions.min_views) checks.push({ key: "min_views", label: "views", target: conditions.min_views, current: metrics.views ?? null, state: checkNum(metrics.views, conditions.min_views) });
  if (conditions.min_participants) checks.push({ key: "min_participants", label: "participants", target: conditions.min_participants, current: metrics.participants, state: checkNum(metrics.participants, conditions.min_participants) });
  if (conditions.min_verified) checks.push({ key: "min_verified", label: "verified", target: conditions.min_verified, current: metrics.verified, state: checkNum(metrics.verified, conditions.min_verified) });

  const progress = checks.length === 0 ? 0 : Math.round((checks.filter((c) => c.state === "met").length / checks.length) * 100);
  return { checks, progress };
}

