import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AFF, commissionFor, maskHandle, refLink, refTweet } from "@/lib/affiliate";
import { feeAmount } from "@/lib/fees";

/** Internal helper — credits the referrer once a pool is confirmed funded. */
export async function creditAffiliate(campaignId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c } = await supabaseAdmin
      .from("campaigns")
      .select("id, owner_id, prize_amount, currency, payment_method, created_at")
      .eq("id", campaignId)
      .single();
    if (!c?.prize_amount) return;
    const { data: ref } = await supabaseAdmin
      .from("referrals")
      .select("id, referrer_id, bound_at")
      .eq("referred_id", c.owner_id)
      .maybeSingle();
    if (!ref) return;
    // Only campaigns created inside the referral's earning window count.
    const windowEnd = Date.parse(ref.bound_at) + AFF.earnMonths * 30 * 86400000;
    if (Date.parse(c.created_at) > windowEnd) return;
    const { data: tiers } = await supabaseAdmin.from("fee_tiers").select("min_amount, rate_percent");
    const fee = feeAmount(tiers ?? [], c.prize_amount);
    const { cost, net, amount } = commissionFor(c.prize_amount, fee, c.payment_method);
    if (net <= 0) return;
    const { data: camp } = await supabaseAdmin.from("campaigns").select("ends_at").eq("id", campaignId).single();
    await supabaseAdmin.from("commissions").insert({
      referral_id: ref.id,
      referrer_id: ref.referrer_id,
      campaign_id: campaignId,
      fee, cost, net, amount,
      currency: c.currency === "USDT" ? "USDT" : c.currency,
      status: "pending",
      // Confirmation clock starts when the campaign ends (refund/chargeback window).
      settle_after: new Date(Date.parse(camp?.ends_at ?? c.created_at) + AFF.confirmDays * 86400000).toISOString(),
    });
  } catch (e) {
    console.error("affiliate credit failed", campaignId, e);
  }
}

/** Internal helper — voids open commissions when a campaign is cancelled/refunded. */
export async function voidAffiliate(campaignId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("commissions")
      .update({ status: "void" })
      .eq("campaign_id", campaignId)
      .in("status", ["pending", "confirmed"]);
  } catch (e) {
    console.error("affiliate void failed", campaignId, e);
  }
}

const CODE_RE = /^[a-z0-9_-]{2,32}$/i;

/** Public: record a referral-link click (no-op for unknown/disabled codes). */
export const trackRefClick = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string; ua?: string }) => input)
  .handler(async ({ data }) => {
    const code = (data.code ?? "").trim().toLowerCase();
    if (!CODE_RE.test(code)) return { ok: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r } = await supabaseAdmin.from("referrers").select("user_id, disabled").eq("code", code).maybeSingle();
    if (!r || r.disabled) return { ok: false };
    await supabaseAdmin.from("referral_clicks").insert({ referrer_id: r.user_id, code, ua: (data.ua ?? "").slice(0, 200) });
    return { ok: true };
  });

const makeCode = async (admin: any, userId: string, handle: string | null) => {
  const base = (handle ?? "fd").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "fd";
  for (let i = 0; i < 8; i++) {
    const code = `${base}${Math.random().toString(36).slice(2, 6)}`;
    const { data } = await admin.from("referrers").select("user_id").eq("code", code).maybeSingle();
    if (!data) return code;
  }
  return `fd${userId.slice(0, 8)}`;
};

const xHandle = async (supabase: any) => {
  const { data } = await supabase.auth.getUser();
  const idt = (data.user?.identities ?? []).find((i: any) => i.provider === "x" || i.provider === "twitter");
  return idt?.identity_data?.user_name ?? idt?.identity_data?.preferred_username ?? null;
};

/** Logged-in: join the program — instant, no review. */
export const joinAffiliate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin.from("referrers").select("*").eq("user_id", userId).maybeSingle();
    if (existing) return { referrer: existing };
    const handle = await xHandle(supabase);
    const code = await makeCode(supabaseAdmin, userId, handle);
    const { data: row, error } = await supabaseAdmin
      .from("referrers")
      .insert({ user_id: userId, code, x_handle: handle })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { referrer: row };
  });

/** Logged-in: bind the caller to the referrer whose link they clicked (≤30d, last click wins, never self). */
export const bindReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string; clickedAt: number }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const code = (data.code ?? "").trim().toLowerCase();
    if (!CODE_RE.test(code)) return { bound: false };
    if (!Number.isFinite(data.clickedAt) || Date.now() - data.clickedAt > AFF.attributionDays * 86400000) return { bound: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r } = await supabaseAdmin.from("referrers").select("user_id, disabled").eq("code", code).maybeSingle();
    if (!r || r.disabled || r.user_id === userId) return { bound: false };
    const { error } = await supabaseAdmin
      .from("referrals")
      .upsert({ referrer_id: r.user_id, referred_id: userId, code }, { onConflict: "referred_id" });
    if (error) return { bound: false };
    return { bound: true };
  });

/** Logged-in: everything the member dashboard needs. */
export const affiliateDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: referrer } = await supabaseAdmin.from("referrers").select("*").eq("user_id", userId).maybeSingle();
    if (!referrer) return { referrer: null };
    const [clicks, refs, comms] = await Promise.all([
      supabaseAdmin.from("referral_clicks").select("created_at").eq("referrer_id", userId),
      supabaseAdmin.from("referrals").select("id, referred_id, bound_at").eq("referrer_id", userId).order("bound_at", { ascending: false }),
      supabaseAdmin
        .from("commissions")
        .select("id, referral_id, campaign_id, fee, cost, net, amount, currency, status, settle_after, paid_at, paid_tx, created_at, campaigns!inner(title, slug, owner_id, ends_at, prize_amount)")
        .eq("referrer_id", userId)
        .order("created_at", { ascending: false }),
    ]);
    // Mask organiser identity — resolve each referral's X handle from their campaigns' tweet URLs.
    const refIds = (refs.data ?? []).map((r) => r.referred_id);
    const { data: camps } = refIds.length
      ? await supabaseAdmin.from("campaigns").select("owner_id, tweet_url").in("owner_id", refIds).not("tweet_url", "is", null)
      : { data: [] };
    const handleByOwner = new Map<string, string>();
    for (const c of camps ?? []) {
      if (handleByOwner.has(c.owner_id)) continue;
      const m = (c.tweet_url as string | null)?.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:\/|$|\?)/);
      if (m?.[1] && !["i", "intent", "home", "search", "share"].includes(m[1].toLowerCase())) handleByOwner.set(c.owner_id, m[1]);
    }
    const monthStart = (offset: number) => {
      const d = new Date(); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); d.setUTCMonth(d.getUTCMonth() - offset); return d.getTime();
    };
    const clickList = clicks.data ?? [];
    const refList = (refs.data ?? []).map((r) => ({
      id: r.id,
      handle: handleByOwner.get(r.referred_id) ? maskHandle(handleByOwner.get(r.referred_id)!) : "—",
      boundAt: r.bound_at,
      monthsLeft: Math.max(0, Math.ceil((Date.parse(r.bound_at) + AFF.earnMonths * 30 * 86400000 - Date.now()) / (30 * 86400000))),
      campaigns: 0, fee: 0, cost: 0, net: 0, amount: 0,
    }));
    const commRows = (comms.data ?? []).map((r: any) => ({
      id: r.id, referralId: r.referral_id, campaignId: r.campaign_id,
      title: r.campaigns?.title ?? "", slug: r.campaigns?.slug ?? "",
      fee: Number(r.fee), cost: Number(r.cost), net: Number(r.net), amount: Number(r.amount),
      currency: r.currency, status: r.status === "pending" && Date.parse(r.settle_after) <= Date.now() ? "confirmed" : r.status,
      settleAfter: r.settle_after, paidAt: r.paid_at, paidTx: r.paid_tx, createdAt: r.created_at,
    }));
    const byRef = new Map(refList.map((r) => [r.id, r]));
    for (const r of commRows) {
      const agg = byRef.get(r.referralId);
      if (!agg) continue;
      agg.campaigns += 1; agg.fee += r.fee; agg.cost += r.cost; agg.net += r.net; agg.amount += r.amount;
    }
    const dayMs = 86400000;
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const clickDays = Array.from({ length: 30 }, (_, i) =>
      clickList.filter((c) => {
        const t = Date.parse(c.created_at);
        return t >= today.getTime() - (29 - i) * dayMs && t < today.getTime() - (28 - i) * dayMs;
      }).length);
    const monthComm = commRows.filter((r) => r.status !== "void" && Date.parse(r.createdAt) >= monthStart(0));
    const monthlyClicks = clickList.filter((c) => Date.parse(c.created_at) >= monthStart(0)).length;
    const activeRefs = new Set(monthComm.map((r) => r.referralId)).size;
    const stages = {
      pending: commRows.filter((r) => r.status === "pending").reduce((s, r) => s + r.amount, 0),
      confirmed: commRows.filter((r) => r.status === "confirmed").reduce((s, r) => s + r.amount, 0),
      paid: commRows.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0),
    };
    const settlements = new Map<string, { month: string; amount: number; paidTx: string | null; paidAt: string }>();
    for (const r of commRows.filter((r) => r.status === "paid")) {
      const key = (r.paidAt ?? r.createdAt).slice(0, 7);
      const s = settlements.get(key) ?? { month: key, amount: 0, paidTx: r.paidTx, paidAt: r.paidAt ?? r.createdAt };
      s.amount += r.amount;
      if (r.paidTx) s.paidTx = r.paidTx;
      settlements.set(key, s);
    }
    return {
      referrer: { code: referrer.code, link: refLink(referrer.code), payoutAddress: referrer.payout_address, verified: !!referrer.verified_at, createdAt: referrer.created_at },
      tweet: refTweet(refLink(referrer.code)),
      kpis: {
        clicks: clickList.length, monthClicks: monthlyClicks, clickDays,
        referrals: refList.length, activeReferrals: activeRefs,
        monthCommission: monthComm.reduce((s, r) => s + r.amount, 0), monthCampaigns: monthComm.length,
      },
      stages,
      referrals: refList,
      commissions: commRows,
      settlements: [...settlements.values()].sort((a, b) => b.month.localeCompare(a.month)),
    };
  });

/** Logged-in member: save the BEP20 payout address. */
export const setAffiliateWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { address: string }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const address = (data.address ?? "").trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("Invalid BEP20 address");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("referrers").update({ payout_address: address, updated_at: new Date().toISOString() }).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const requireAdmin = async (admin: any, userId: string) => {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Admins only");
};

/** Admin: confirmed commissions awaiting payout, grouped per referrer. */
export const adminAffiliatePayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(supabaseAdmin, userId);
    const { data } = await supabaseAdmin
      .from("commissions")
      .select("id, referrer_id, amount, currency, status, settle_after")
      .eq("status", "pending")
      .lt("settle_after", new Date().toISOString());
    const byRef = new Map<string, { referrerId: string; ids: string[]; amount: number }>();
    for (const r of data ?? []) {
      const e = byRef.get(r.referrer_id) ?? { referrerId: r.referrer_id, ids: [], amount: 0 };
      e.ids.push(r.id); e.amount += Number(r.amount);
      byRef.set(r.referrer_id, e);
    }
    const { data: refs } = await supabaseAdmin.from("referrers").select("user_id, code, x_handle, payout_address").in("user_id", [...byRef.keys()]);
    const meta = new Map((refs ?? []).map((r) => [r.user_id, r]));
    return {
      payouts: [...byRef.values()].map((p) => ({
        ...p,
        code: meta.get(p.referrerId)?.code ?? "",
        handle: meta.get(p.referrerId)?.x_handle ?? "",
        address: meta.get(p.referrerId)?.payout_address ?? "",
      })),
    };
  });

/** Admin: mark commissions paid after sending the USDT on-chain. */
export const markCommissionsPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; tx: string }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const tx = (data.tx ?? "").trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) throw new Error("Invalid transaction hash");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(supabaseAdmin, userId);
    const { error } = await supabaseAdmin
      .from("commissions")
      .update({ status: "paid", paid_tx: tx, paid_at: new Date().toISOString() })
      .in("id", data.ids ?? [])
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
