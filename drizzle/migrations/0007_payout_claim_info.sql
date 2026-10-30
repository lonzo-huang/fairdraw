-- Winners can declare how they want to be paid (PayPal email, USDT address,
-- bank hint, Alipay, ...) so organisers can pay out manually without forcing
-- Stripe Connect onboarding. Free text written only by the winning account.
ALTER TABLE public.payouts
  ADD COLUMN claim_info text;
