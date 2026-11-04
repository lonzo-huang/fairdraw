/**
 * Server-only Stripe client. Secrets come from process.env, never shipped to the client.
 * Required env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (webhook handler only).
 */
import Stripe from "stripe";

let _stripe: Stripe | undefined;

export function stripe(): Stripe {
  if (!_stripe) {
    const key = process.env["STRIPE_SECRET_KEY"];
    if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
    _stripe = new Stripe(key);
  }
  return _stripe;
}

/** Stripe Checkout only supports fiat currencies. */
export const STRIPE_SUPPORTED_CURRENCIES = new Set(["usd", "eur", "gbp", "cny"]);

/** Pinned preview version — Connect Accounts v2 requires it until GA. */
const API_V2_VERSION = "2025-10-29.preview";

/**
 * Thin fetch wrapper for /v2 endpoints (Accounts v2, Account Links v2) that
 * stripe-node does not expose yet. Uses the same secret key + Bearer auth.
 * eslint-disable-next-line @typescript-eslint/no-explicit-any
 */
export async function stripeV2(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<any> {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Stripe-Version": API_V2_VERSION },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`https://api.stripe.com${path}`, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message ?? `Stripe v2 request failed (${r.status})`);
  return j;
}
