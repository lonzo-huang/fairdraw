-- Stripe Connect payouts: winners onboard onto Express accounts to receive
-- transfers. We only store the connected account id — no PII touches our DB.
ALTER TABLE public.payouts
  ADD COLUMN stripe_account_id text;
