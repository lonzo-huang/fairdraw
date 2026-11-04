/**
 * Server-only Wise API client for cross-border prize payouts.
 * Required env: WISE_API_TOKEN, WISE_PROFILE_ID (the business profile id).
 * Optional env: WISE_BASE — defaults to https://api.wise.com;
 * sandbox is https://api.sandbox.transferwise.tech.
 *
 * Wise has no official transfers SDK — thin JSON fetch wrapper, same pattern
 * as stripeV2(). Recipient form fields are corridor-specific, so they are
 * discovered dynamically via /v1/account-requirements.
 */

const base = () => process.env["WISE_BASE"] ?? "https://api.wise.com";

function token(): string {
  const t = process.env["WISE_API_TOKEN"];
  if (!t) throw new Error("Missing WISE_API_TOKEN");
  return t;
}

export function wiseProfileId(): string {
  const id = process.env["WISE_PROFILE_ID"];
  if (!id) throw new Error("Missing WISE_PROFILE_ID");
  return id;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export async function wise(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<any> {
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await fetch(`${base()}${path}`, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.errors?.[0]?.message ?? j?.errorMessage ?? j?.message ?? `Wise request failed (${r.status})`;
    throw new Error(msg);
  }
  return j;
}

/**
 * Quote for paying out a fixed TARGET amount to the winner.
 * Funded from the platform's Wise balance.
 */
export async function wiseQuote(sourceCurrency: string, targetCurrency: string, targetAmount: number) {
  return wise("POST", `/v3/profiles/${wiseProfileId()}/quotes`, {
    sourceCurrency,
    targetCurrency,
    targetAmount,
    payInMethod: "BALANCE",
    priceType: "REGULAR",
  });
}

/**
 * Dynamic recipient form requirements for a corridor — tells us which fields
 * (alipayId, IBAN, routing, address…) Wise wants for this currency/country.
 */
export async function wiseAccountRequirements(params: {
  sourceCurrency: string;
  sourceAmount: number;
  targetCurrency: string;
}) {
  const q = new URLSearchParams({
    sourceCurrency: params.sourceCurrency,
    sourceAmount: String(params.sourceAmount),
    targetCurrency: params.targetCurrency,
  });
  return wise("GET", `/v1/account-requirements?${q}`);
}

/**
 * Create a recipient bank/ewallet account.
 * `type` comes from account-requirements (e.g. "alipay", "chinese_unionpay_card", "iban", "aba").
 * `details` is the corridor-specific field bag the winner filled in.
 */
export async function wiseRecipient(account: {
  currency: string;
  type: string;
  accountHolderName: string;
  details: Record<string, string>;
}) {
  return wise("POST", "/v1/accounts", {
    currency: account.currency,
    type: account.type,
    profile: Number(wiseProfileId()),
    accountHolderName: account.accountHolderName,
    legalType: "PRIVATE",
    details: account.details,
  });
}

/** Create a payout transfer from a quote to a recipient. */
export async function wiseCreateTransfer(opts: { recipientId: number; quoteUuid: string; reference: string }) {
  return wise("POST", "/v1/transfers", {
    targetAccount: opts.recipientId,
    quoteUuid: opts.quoteUuid,
    customerTransactionId: crypto.randomUUID(),
    details: { reference: opts.reference },
  });
}

/** Fund the transfer from the platform's Wise balance. */
export async function wiseFundTransfer(transferId: number) {
  return wise("POST", `/v3/profiles/${wiseProfileId()}/transfers/${transferId}/payments`, { type: "BALANCE" });
}

/** Current transfer status — webhooks only signal which id changed; always re-read. */
export async function wiseTransferStatus(transferId: number) {
  return wise("GET", `/v1/transfers/${transferId}`);
}

/** Remaining platform balance per currency — used to verify funds before paying. */
export async function wiseBalances() {
  return wise("GET", `/v4/profiles/${wiseProfileId()}/balances?types=STANDARD`);
}
