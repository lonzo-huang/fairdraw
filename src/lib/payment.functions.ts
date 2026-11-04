import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CANCEL_WINDOW_MS } from "@/lib/campaign.functions";
import { feeAmount } from "@/lib/fees";
import { chainConfig, stripeChargeCurrency, stripeSupports, toMinorUnits } from "@/lib/payments";
import type { Json } from "@/integrations/supabase/types";

/** Local copy — chain.server.ts must not be imported at top level here (client bundle). */
function isValidAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

async function loadCampaign(supabase: any, campaignId: string, userId: string) {
  const { data: c, error } = await supabase
    .from("campaigns")
    .select("id, owner_id, status, title, prize_amount, currency, escrow_status, payment_method, winners_count")
    .eq("id", campaignId)
    .single();
  if (error || !c) throw new Error("Campaign not found");
  if (c.owner_id !== userId) throw new Error("Forbidden");
  return c;
}

const normHandle = (h: string) => h.trim().toLowerCase().replace(/^@/, "");

/**
 * The caller's verified X handle from their OAuth identity, or null when the
 * account never signed in with X. Supabase-verified — cannot be forged.
 */
async function boundXHandle(supabase: any): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  const idt = (data.user?.identities ?? []).find((i: any) => i.provider === "x" || i.provider === "twitter");
  const raw = idt?.identity_data?.user_name ?? idt?.identity_data?.preferred_username ?? idt?.identity_data?.screen_name;
  return typeof raw === "string" && raw ? normHandle(raw) : null;
}

async function requireAdmin(supabaseAdmin: any, userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admins only");
}

/** Pool + tiered platform fee, in the campaign's own currency. */
async function fundingTotals(supabaseAdmin: any, c: { prize_amount: number | null; currency: string }) {
  const pool = Number(c.prize_amount ?? 0);
  if (!(pool > 0)) throw new Error("Campaign has no prize pool amount");
  const { data: tiers } = await supabaseAdmin.from("fee_tiers").select("min_amount, rate_percent");
  const fee = feeAmount(tiers ?? [], pool);
  return { pool, fee, total: pool + fee };
}

/** Creates a Stripe Checkout Session to fund the pool + fee. Returns the hosted checkout URL. */
export const startStripeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string; origin: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await loadCampaign(supabase, data.campaignId, userId);
    if (c.payment_method !== "stripe") throw new Error("Campaign is not set to Stripe funding");
    if (!stripeSupports(c.currency)) throw new Error(`Stripe cannot charge ${c.currency} — use on-chain USDT funding`);
    if (c.escrow_status === "funded" || c.escrow_status === "preauthorized" || c.escrow_status === "charged")
      throw new Error("Pool already funded");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { stripe } = await import("@/lib/stripe.server");
    const { pool, fee, total } = await fundingTotals(supabaseAdmin, c);
    const units = toMinorUnits(total);
    if (!units) throw new Error("Invalid amount");

    const origin = data.origin.replace(/\/$/, "");
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: stripeChargeCurrency(c.currency),
            unit_amount: units,
            product_data: {
              name: `FairDraw pool + fee — ${c.title}`,
              description: `Pool ${pool} + platform fee ${fee} ${c.currency}`,
            },
          },
        },
      ],
      metadata: { campaign_id: c.id, pool: String(pool), fee: String(fee), currency: c.currency },
      success_url: `${origin}/manage/${c.id}?funded=1`,
      cancel_url: `${origin}/manage/${c.id}`,
    });

    await supabaseAdmin.from("payments").insert({
      campaign_id: c.id,
      user_id: userId,
      provider: "stripe",
      kind: "pool",
      status: "pending",
      amount: total,
      currency: c.currency,
      external_ref: session.id,
      meta: { pool, fee } as unknown as Json,
    });
    return { url: session.url };
  });

/**Resizes a declared pool within the publish window. Unfunded campaigns update
 * directly. Funded Stripe pools part-refund the difference (decrease) or issue a
 * top-up Checkout (increase — prize_amount applies when the webhook confirms).
 * Funded on-chain pools cannot be resized: cancel and recreate instead.
 */
export const updateCampaignAmount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string; amount: number; origin?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: c, error } = await supabase
      .from("campaigns")
      .select("id, owner_id, status, created_at, title, prize_amount, currency, escrow_status, payment_method")
      .eq("id", data.campaignId)
      .single();
    if (error || !c) throw new Error("Campaign not found");
    if (c.owner_id !== userId) throw new Error("Forbidden");
    if (c.status !== "open") throw new Error("Campaign is not open");
    if (Date.parse(c.created_at) + CANCEL_WINDOW_MS < Date.now())
      throw new Error("The 1-hour update window has closed");
    const next = Number(data.amount);
    if (!(next > 0)) throw new Error("Invalid amount");
    const prev = Number(c.prize_amount ?? 0);
    if (next === prev) return { ok: true };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const FUNDED = new Set(["funded", "preauthorized", "charged"]);
    if (!FUNDED.has(c.escrow_status)) {
      const { error: uErr } = await supabaseAdmin.from("campaigns").update({ prize_amount: next }).eq("id", c.id);
      if (uErr) throw new Error(uErr.message);
      return { ok: true };
    }
    if (c.payment_method !== "stripe")
      throw new Error("Funded on-chain pools cannot be resized — cancel within the window and recreate");

    const { stripe } = await import("@/lib/stripe.server");
    const { data: tiers } = await supabaseAdmin.from("fee_tiers").select("min_amount, rate_percent");
    const delta = (next + feeAmount(tiers ?? [], next)) - (prev + feeAmount(tiers ?? [], prev));

    const { data: pay } = await supabaseAdmin
      .from("payments")
      .select("external_ref")
      .eq("campaign_id", c.id)
      .eq("provider", "stripe")
      .eq("kind", "pool")
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!pay?.external_ref) throw new Error("No confirmed Stripe payment found");

    if (delta < 0) {
      const session = await stripe().checkout.sessions.retrieve(pay.external_ref);
      const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (!pi) throw new Error("Stripe payment intent not found");
      const units = toMinorUnits(-delta);
      if (!units) throw new Error("Invalid refund amount");
      const refund = await stripe().refunds.create({ payment_intent: pi, amount: units });
      await supabaseAdmin.from("payments").insert({
        campaign_id: c.id,
        user_id: userId,
        provider: "stripe",
        kind: "refund",
        status: refund.status === "succeeded" || refund.status === "pending" ? "confirmed" : "pending",
        amount: -delta,
        currency: c.currency,
        external_ref: refund.id,
        meta: { partial: true, new_pool: next } as unknown as Json,
      });
      const { error: uErr } = await supabaseAdmin.from("campaigns").update({ prize_amount: next }).eq("id", c.id);
      if (uErr) throw new Error(uErr.message);
      return { ok: true, refunded: -delta };
    }

    const units = toMinorUnits(delta);
    if (!units) throw new Error("Invalid top-up amount");
    const origin = (data.origin ?? "").replace(/\/$/, "") || "https://www.fairdraw.win";
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: stripeChargeCurrency(c.currency),
            unit_amount: units,
            product_data: {
              name: `FairDraw pool top-up — ${c.title}`,
              description: `Pool ${prev} → ${next} ${c.currency}`,
            },
          },
        },
      ],
      metadata: { campaign_id: c.id, topup_to: String(next), currency: c.currency },
      success_url: `${origin}/manage/${c.id}?funded=1`,
      cancel_url: `${origin}/manage/${c.id}`,
    });
    await supabaseAdmin.from("payments").insert({
      campaign_id: c.id,
      user_id: userId,
      provider: "stripe",
      kind: "topup",
      status: "pending",
      amount: delta,
      currency: c.currency,
      external_ref: session.id,
      meta: { new_pool: next } as unknown as Json,
    });
    return { ok: true, checkoutUrl: session.url };
  });

/**
 * 
 * Confirms an on-chain funding tx: the organizer sent pool+fee in the configured
 * token to the platform wallet via MetaMask. Verified against the chain receipt —
 * the tx hash alone is never trusted.
 */
export const confirmChainPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string; txHash: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const c = await loadCampaign(supabase, data.campaignId, userId);
    if (c.escrow_status === "funded" || c.escrow_status === "charged") throw new Error("Pool already funded");
    const cfg = chainConfig();
    if (!cfg.receiverAddress) throw new Error("Platform wallet is not configured");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pool, fee, total } = await fundingTotals(supabaseAdmin, c);
    const { verifyTokenTransfer } = await import("@/lib/chain.server");
    const tx = await verifyTokenTransfer(data.txHash as `0x${string}`, cfg.receiverAddress, total);

    await supabaseAdmin.from("payments").upsert(
      {
        campaign_id: c.id,
        user_id: userId,
        provider: "chain",
        kind: "pool",
        status: "confirmed",
        amount: total,
        currency: cfg.tokenSymbol,
        external_ref: data.txHash,
        meta: { pool, fee, from: tx.from, chain_id: cfg.chainId } as unknown as Json,
      },
      { onConflict: "provider,external_ref" },
    );
    const { error } = await supabaseAdmin
      .from("campaigns")
      .update({ escrow_status: "funded" })
      .eq("id", c.id)
      .eq("escrow_status", "awaiting");
    if (error) throw new Error(error.message);
    return { ok: true, from: tx.from, amount: tx.amount };
  });

/** Links a MetaMask address to the account via a personal-sign challenge. */
export const linkWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { address: string; message: string; signature: string }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    if (!isValidAddress(data.address)) throw new Error("Invalid address");
    if (!data.message.includes(data.address)) throw new Error("Challenge message must contain the address");

    const { verifyMessage } = await import("viem");
    const ok = await verifyMessage({
      address: data.address as `0x${string}`,
      message: data.message,
      signature: data.signature as `0x${string}`,
    });
    if (!ok) throw new Error("Signature verification failed");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("wallets")
      .upsert({ user_id: userId, address: data.address.toLowerCase() }, { onConflict: "user_id,address" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Records an on-chain payout: verifies the tx actually transferred the winner's
 * share to their wallet, then marks the payout paid with the tx hash as proof.
 * Owner or admin may submit (whoever's wallet sent the funds).
 */
export const recordChainPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { payoutId: string; txHash: string; walletAddress: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!isValidAddress(data.walletAddress)) throw new Error("Invalid winner address");

    const { data: p, error } = await supabase
      .from("payouts")
      .select("id, campaign_id, winner_handle, status")
      .eq("id", data.payoutId)
      .single();
    if (error || !p) throw new Error("Payout not found");
    if (p.status === "paid") throw new Error("Already paid");

    const { data: c } = await supabase
      .from("campaigns")
      .select("id, owner_id, prize_amount, currency, winners_count")
      .eq("id", p.campaign_id)
      .single();
    if (!c) throw new Error("Campaign not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (c.owner_id !== userId && !role) throw new Error("Forbidden");

    const cfg = chainConfig();
    const share = c.prize_amount && c.winners_count > 0 ? Number(c.prize_amount) / c.winners_count : 0;
    const { verifyTokenTransfer } = await import("@/lib/chain.server");
    const tx = await verifyTokenTransfer(
      data.txHash as `0x${string}`,
      data.walletAddress as `0x${string}`,
      share > 0 ? share : undefined,
    );

    const proof = cfg.explorerTx ? cfg.explorerTx + data.txHash : data.txHash;
    await supabaseAdmin
      .from("payouts")
      .update({
        status: "paid",
        proof,
        tx_hash: data.txHash,
        wallet_address: data.walletAddress.toLowerCase(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", p.id);
    await supabaseAdmin.from("payments").upsert(
      {
        campaign_id: c.id,
        user_id: userId,
        provider: "chain",
        kind: "payout",
        status: "confirmed",
        amount: Number(tx.amount),
        currency: cfg.tokenSymbol,
        external_ref: data.txHash,
        meta: { winner: p.winner_handle, to: tx.to, from: tx.from, chain_id: cfg.chainId } as unknown as Json,
      },
      { onConflict: "provider,external_ref" },
    );
    return { ok: true, amount: tx.amount };
  });

/**
 * Admin-only: refunds a chain-funded pool by verifying a transfer back to the
 * original funder's address (recorded in the funding payment's meta.from).
 */
export const refundChainEscrow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string; txHash: string }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(supabaseAdmin, userId);

    const { data: c } = await supabaseAdmin
      .from("campaigns")
      .select("id, status, escrow_status, prize_amount")
      .eq("id", data.campaignId)
      .single();
    if (!c) throw new Error("Campaign not found");
    if (c.status === "drawn") throw new Error("Already drawn");
    if (c.escrow_status !== "funded" && c.escrow_status !== "refund_pending") throw new Error("No funded pool to refund");

    const { data: funding } = await supabaseAdmin
      .from("payments")
      .select("meta")
      .eq("campaign_id", c.id)
      .eq("provider", "chain")
      .eq("kind", "pool")
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const funder = (funding?.meta as { from?: string } | null)?.from;
    if (!funder) throw new Error("Original funder address unknown");

    const { verifyTokenTransfer } = await import("@/lib/chain.server");
    const cfg = chainConfig();
    const tx = await verifyTokenTransfer(data.txHash as `0x${string}`, funder as `0x${string}`, Number(c.prize_amount ?? 0));

    await supabaseAdmin.from("payments").upsert(
      {
        campaign_id: c.id,
        user_id: userId,
        provider: "chain",
        kind: "refund",
        status: "confirmed",
        amount: Number(tx.amount),
        currency: cfg.tokenSymbol,
        external_ref: data.txHash,
        meta: { to: tx.to, from: tx.from, chain_id: cfg.chainId } as unknown as Json,
      },
      { onConflict: "provider,external_ref" },
    );
    await supabaseAdmin.from("campaigns").update({ escrow_status: "refunded" }).eq("id", c.id);
    return { ok: true, amount: tx.amount };
  });

/**
 * Winner side: declares how they want to be paid (PayPal email, USDT address,
 * bank hint, ...). Verifies the caller owns the winning entry. The organiser
 * sees this on the manage page and pays out-of-band — no KYC required.
 */
export const submitPayoutInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { payoutId: string; info: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const info = data.info.trim();
    if (!info || info.length > 200) throw new Error("Payout info must be 1–200 characters");

    const { data: p, error } = await supabase
      .from("payouts")
      .select("id, campaign_id, winner_handle, status")
      .eq("id", data.payoutId)
      .single();
    if (error || !p) throw new Error("Payout not found");
    if (p.status === "paid") throw new Error("Already paid");

    // Only the account that owns the winning entry may claim.
    const { data: mine } = await supabase
      .from("entries")
      .select("id")
      .eq("campaign_id", p.campaign_id)
      .eq("user_id", userId)
      .eq("handle", p.winner_handle)
      .maybeSingle();
    if (!mine) throw new Error("This prize does not belong to your account");

    // If the account is X-linked, its verified handle must equal the winning
    // handle — blocks claiming a prize drawn for someone else's X account.
    const bound = await boundXHandle(supabase);
    if (bound && bound !== normHandle(p.winner_handle))
      throw new Error("Your X account does not match the winning handle");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin
      .from("payouts")
      .update({ claim_info: info, updated_at: new Date().toISOString() })
      .eq("id", p.id)
      .eq("status", "pending");
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

/**
 * Winner side: claims a Stripe-funded prize. Verifies the caller owns the
 * winning entry, creates/reuses a Stripe Express connected account, and
 * returns the hosted onboarding URL (KYC handled by Stripe).
 */
export const claimStripePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { payoutId: string; origin: string; country?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: p, error } = await supabase
      .from("payouts")
      .select("id, campaign_id, winner_handle, status, stripe_account_id")
      .eq("id", data.payoutId)
      .single();
    if (error || !p) throw new Error("Payout not found");
    if (p.status === "paid") throw new Error("Already paid");

    const { data: c } = await supabase
      .from("campaigns")
      .select("id, slug, payment_method")
      .eq("id", p.campaign_id)
      .single();
    if (!c) throw new Error("Campaign not found");
    if (c.payment_method !== "stripe") throw new Error("This campaign does not pay out via Stripe");

    // Only the account that owns the winning entry may claim.
    const { data: mine } = await supabase
      .from("entries")
      .select("id")
      .eq("campaign_id", c.id)
      .eq("user_id", userId)
      .eq("handle", p.winner_handle)
      .maybeSingle();
    if (!mine) throw new Error("This prize does not belong to your account");

    const bound = await boundXHandle(supabase);
    if (bound && bound !== normHandle(p.winner_handle))
      throw new Error("Your X account does not match the winning handle");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { stripeV2 } = await import("@/lib/stripe.server");

    let accountId = p.stripe_account_id;
    if (!accountId) {
      // Accounts v2 requires the recipient's country upfront — the hosted
      // onboarding form renders payout fields based on it.
      const country = (data.country ?? "").trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(country)) throw new Error("Select your country before claiming via Stripe");
      const email = (await supabase.auth.getUser()).data.user?.email ?? undefined;
      const account = await stripeV2("POST", "/v2/core/accounts", {
        display_name: `FairDraw winner @${p.winner_handle}`,
        ...(email ? { contact_email: email } : {}),
        identity: { entity_type: "individual", country },
        dashboard: "express",
        configuration: {
          // stripe_transfers (receive /v1/transfers) requires merchant.card_payments.
          merchant: { capabilities: { card_payments: { requested: true } } },
          recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
        },
        defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
        metadata: { campaign_id: c.id, payout_id: p.id, winner: p.winner_handle },
      });
      accountId = account.id;
      await supabaseAdmin
        .from("payouts")
        .update({ stripe_account_id: accountId, updated_at: new Date().toISOString() })
        .eq("id", p.id);
    }

    const origin = data.origin.replace(/\/$/, "");
    const link = await stripeV2("POST", "/v2/core/account_links", {
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["merchant", "recipient"],
          refresh_url: `${origin}/r/${c.slug}`,
          return_url: `${origin}/r/${c.slug}?claimed=1`,
        },
      },
    });
    return { url: link.url };
  });

/**
 * Executes the committed Stripe transfer for a pending payout. Amount and
 * destination come only from DB rows committed at draw time, so any caller
 * may safely trigger it. Flips status pending → paying first so concurrent
 * calls cannot double-transfer; reverts on failure.
 */
async function executeStripeTransfer(
  p: { id: string; stripe_account_id: string; winner_handle: string },
  c: { id: string; prize_amount: number | null; currency: string; winners_count: number },
  actorId: string,
): Promise<{ ok: boolean; reason?: "not_ready" | "in_progress"; transferId?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { stripe, stripeV2 } = await import("@/lib/stripe.server");

  // v2 readiness: the recipient can receive transfers once the capability is active.
  const account = await stripeV2("GET", `/v2/core/accounts/${p.stripe_account_id}?include[0]=configuration.recipient`);
  const ready = account?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status === "active";
  if (!ready) return { ok: false, reason: "not_ready" };

  // Optimistic lock — the first caller to flip pending → paying owns the transfer.
  const { data: locked } = await supabaseAdmin
    .from("payouts")
    .update({ status: "paying", updated_at: new Date().toISOString() })
    .eq("id", p.id)
    .eq("status", "pending")
    .select("id");
  if (!locked?.length) return { ok: false, reason: "in_progress" };

  try {
    const share = c.prize_amount && c.winners_count > 0 ? Number(c.prize_amount) / c.winners_count : 0;
    const units = toMinorUnits(share);
    if (!units) throw new Error("Invalid amount");

    // Tie the transfer to the funding charge so it succeeds even while the
    // charge is still settling into the platform balance.
    let sourceTransaction: string | undefined;
    const { data: funding } = await supabaseAdmin
      .from("payments")
      .select("external_ref")
      .eq("campaign_id", c.id)
      .eq("provider", "stripe")
      .eq("kind", "pool")
      .in("status", ["paid", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (funding?.external_ref) {
      const session = await stripe().checkout.sessions.retrieve(funding.external_ref);
      const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (pi) {
        const intent = await stripe().paymentIntents.retrieve(pi);
        const charge = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
        if (charge) sourceTransaction = charge;
      }
    }

    const transfer = await stripe().transfers.create({
      amount: units,
      currency: c.currency.toLowerCase(),
      destination: p.stripe_account_id,
      ...(sourceTransaction ? { source_transaction: sourceTransaction } : {}),
      description: `FairDraw prize — ${p.winner_handle}`,
      metadata: { campaign_id: c.id, payout_id: p.id },
    });

    await supabaseAdmin
      .from("payouts")
      .update({ status: "paid", proof: `stripe:transfer:${transfer.id}`, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    await supabaseAdmin.from("payments").insert({
      campaign_id: c.id,
      user_id: actorId,
      provider: "stripe",
      kind: "payout",
      status: "confirmed",
      amount: share,
      currency: c.currency,
      external_ref: transfer.id,
      meta: { winner: p.winner_handle, destination: p.stripe_account_id } as unknown as Json,
    });
    return { ok: true, transferId: transfer.id };
  } catch (err) {
    // Release the lock so the payout can be retried.
    await supabaseAdmin
      .from("payouts")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("id", p.id)
      .eq("status", "paying");
    throw err;
  }
}

/**
 * Organiser side: manually triggers the committed Stripe transfer to the
 * winner's onboarded account. Kept as a fallback — autoStripePayout normally
 * fires it when the winner returns from hosted onboarding.
 */
export const payoutViaStripe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { payoutId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: p, error } = await supabase
      .from("payouts")
      .select("id, campaign_id, winner_handle, status, stripe_account_id")
      .eq("id", data.payoutId)
      .single();
    if (error || !p) throw new Error("Payout not found");
    if (p.status === "paid") throw new Error("Already paid");
    if (!p.stripe_account_id) throw new Error("Winner has not claimed via Stripe yet");

    const { data: c } = await supabase
      .from("campaigns")
      .select("id, owner_id, prize_amount, currency, winners_count, payment_method, escrow_status")
      .eq("id", p.campaign_id)
      .single();
    if (!c) throw new Error("Campaign not found");
    if (c.owner_id !== userId) throw new Error("Forbidden");
    if (c.payment_method !== "stripe") throw new Error("Campaign is not Stripe-funded");
    if (c.escrow_status !== "charged" && c.escrow_status !== "funded")
      throw new Error("Pool is not funded");

    const r = await executeStripeTransfer(
      { id: p.id, stripe_account_id: p.stripe_account_id, winner_handle: p.winner_handle },
      c,
      userId,
    );
    if (!r.ok) {
      if (r.reason === "not_ready") throw new Error("Winner has not finished Stripe onboarding");
      throw new Error("Payout already in progress");
    }
    return { ok: true, transferId: r.transferId };
  });

/**
 * Winner/auto side: fires the committed transfer once the recipient's
 * stripe_transfers capability is active. Safe for any signed-in caller — the
 * amount and destination are committed in the payout row and a status lock
 * prevents double transfers. Called by the result page when the winner
 * returns from hosted onboarding (?claimed=1).
 */
export const autoStripePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { payoutId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: p } = await supabase
      .from("payouts")
      .select("id, campaign_id, winner_handle, status, stripe_account_id")
      .eq("id", data.payoutId)
      .single();
    if (!p || p.status !== "pending" || !p.stripe_account_id) return { paid: false };

    const { data: c } = await supabase
      .from("campaigns")
      .select("id, prize_amount, currency, winners_count, payment_method, escrow_status")
      .eq("id", p.campaign_id)
      .single();
    if (!c || c.payment_method !== "stripe" || (c.escrow_status !== "charged" && c.escrow_status !== "funded"))
      return { paid: false };

    const r = await executeStripeTransfer(
      { id: p.id, stripe_account_id: p.stripe_account_id, winner_handle: p.winner_handle },
      c,
      userId,
    );
    return { paid: r.ok };
  });

/**
 * Winner side (non-EU region): claims the prize via Wise. Corridor-specific
 * recipient fields come from getWiseClaimRequirements; the transfer is funded
 * from the platform's Wise balance immediately and syncWisePayout flips it to
 * paid once Wise sends it out.
 */
export const claimWisePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { payoutId: string; recipientType: string; accountHolderName: string; details: Record<string, string> }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: p } = await supabase
      .from("payouts")
      .select("id, campaign_id, winner_handle, status, stripe_account_id, wise_transfer_id")
      .eq("id", data.payoutId)
      .single();
    if (!p) throw new Error("Payout not found");
    if (p.status !== "pending") throw new Error("Payout already processed");
    if (p.stripe_account_id || p.wise_transfer_id) throw new Error("Payout already claimed");

    const { data: c } = await supabase
      .from("campaigns")
      .select("id, prize_amount, currency, winners_count, escrow_status")
      .eq("id", p.campaign_id)
      .single();
    if (!c) throw new Error("Campaign not found");
    if (c.escrow_status !== "charged" && c.escrow_status !== "funded") throw new Error("Pool is not funded");

    // Only the account that owns the winning entry may claim.
    const { data: mine } = await supabase
      .from("entries")
      .select("id")
      .eq("campaign_id", c.id)
      .eq("user_id", userId)
      .eq("handle", p.winner_handle)
      .maybeSingle();
    if (!mine) throw new Error("This prize does not belong to your account");

    const bound = await boundXHandle(supabase);
    if (bound && bound !== normHandle(p.winner_handle))
      throw new Error("Your X account does not match the winning handle");

    const recipientType = data.recipientType.trim();
    const holder = data.accountHolderName.trim();
    const details = Object.fromEntries(
      Object.entries(data.details ?? {})
        .map(([k, v]) => [k.trim(), String(v).trim()] as const)
        .filter(([k, v]) => k && v),
    );
    if (!recipientType || !holder || !Object.keys(details).length)
      throw new Error("Fill in all recipient details");

    const share = c.prize_amount && c.winners_count > 0 ? Number(c.prize_amount) / c.winners_count : 0;
    if (share <= 0) throw new Error("Invalid amount");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { wiseQuote, wiseRecipient, wiseCreateTransfer, wiseFundTransfer } = await import("@/lib/wise.server");
    const source = process.env["WISE_SOURCE_CURRENCY"] ?? "GBP";

    const quote = await wiseQuote(source, c.currency, share);
    const recipient = await wiseRecipient({ currency: c.currency, type: recipientType, accountHolderName: holder, legalType: details["legalType"] === "BUSINESS" ? "BUSINESS" : "PRIVATE", details });
    const transfer = await wiseCreateTransfer({ recipientId: recipient.id, quoteUuid: quote.id, reference: `FairDraw prize — ${p.winner_handle}` });
    await wiseFundTransfer(transfer.id);

    // Not paid yet — Wise delivers asynchronously; syncWisePayout confirms.
    await supabaseAdmin
      .from("payouts")
      .update({ wise_transfer_id: transfer.id, claim_info: `Wise ${recipientType} → ${holder}`, updated_at: new Date().toISOString() })
      .eq("id", p.id)
      .eq("status", "pending");
    return { ok: true, transferId: transfer.id };
  });

/**
 * Re-reads an in-flight Wise transfer. Completed/sent → mark paid with proof;
 * bounced/cancelled/refunded → release the payout so the winner can claim
 * again. Any signed-in visitor may trigger — it only reads committed state.
 */
export const syncWisePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { payoutId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: p } = await supabase
      .from("payouts")
      .select("id, status, wise_transfer_id")
      .eq("id", data.payoutId)
      .single();
    if (!p?.wise_transfer_id || p.status === "paid") return { paid: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { wiseTransferStatus } = await import("@/lib/wise.server");
    const t = await wiseTransferStatus(p.wise_transfer_id);

    if (t.status === "outgoing_payment_sent" || t.status === "completed") {
      await supabaseAdmin
        .from("payouts")
        .update({ status: "paid", proof: `wise:transfer:${t.id}`, updated_at: new Date().toISOString() })
        .eq("id", p.id)
        .eq("status", "pending");
      return { paid: true };
    }
    if (["cancelled", "bounced_back", "funds_refunded", "failed"].includes(t.status)) {
      // Release the payout — winner can re-claim with corrected details.
      await supabaseAdmin
        .from("payouts")
        .update({ wise_transfer_id: null, updated_at: new Date().toISOString() })
        .eq("id", p.id)
        .eq("status", "pending");
      return { paid: false, failed: true };
    }
    return { paid: false };
  });

/**
 * Dynamic recipient form spec for the claim UI — Wise returns which fields
 * each account type needs for this corridor (alipay, unionpay, iban, aba…).
 */
export const getWiseClaimRequirements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { targetCurrency: string }) => input)
  .handler(async ({ data }) => {
    const { wiseAccountRequirements } = await import("@/lib/wise.server");
    const source = process.env["WISE_SOURCE_CURRENCY"] ?? "GBP";
    // Field specs are amount-independent for our purposes — fixed estimate.
    return wiseAccountRequirements({ sourceCurrency: source, sourceAmount: 1000, targetCurrency: data.targetCurrency });
  });

/** Public config for the funding UI (no secrets). */
export const getPaymentConfig = createServerFn({ method: "GET" }).handler(async () => {
  const cfg = chainConfig();
  return {
    chain: {
      chainId: cfg.chainId,
      tokenAddress: cfg.tokenAddress,
      tokenDecimals: cfg.tokenDecimals,
      tokenSymbol: cfg.tokenSymbol,
      receiverAddress: cfg.receiverAddress,
      explorerTx: cfg.explorerTx,
    },
    stripeEnabled: !!process.env["STRIPE_SECRET_KEY"],
  };
});
