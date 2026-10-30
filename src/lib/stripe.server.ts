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
