export type PlanId = "free" | "pro" | "premium";

export const PLANS: { id: PlanId; price: number; weekly: number }[] = [
  { id: "free", price: 0, weekly: 1 },
  { id: "pro", price: 9, weekly: 5 },
  { id: "premium", price: 19, weekly: 20 },
];

/** Must match public.plan_weekly_limit in the database. */
export function weeklyLimit(plan: string | null | undefined): number {
  return PLANS.find((p) => p.id === plan)?.weekly ?? 1;
}

/** Start of the current quota week: Monday 00:00 UTC. */
export function weekStartUTC(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

export function detectPlatform(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h === "x.com" || h === "twitter.com" || h.endsWith(".x.com")) return "x";
    if (h.includes("youtube.com") || h === "youtu.be") return "youtube";
    if (h.includes("discord")) return "discord";
    if (h.includes("instagram.com")) return "instagram";
    if (h.includes("tiktok.com")) return "tiktok";
    return "other";
  } catch {
    return "other";
  }
}

export const CURRENCIES = ["CNY", "USD", "USDT", "EUR", "GBP"] as const;
export const DURATIONS = [1, 2, 3] as const;
export function endsAtFromDays(days: number, now = Date.now()) {
  const d = Math.min(3, Math.max(1, Math.round(days)));
  return new Date(now + d * 864e5).toISOString();
}

