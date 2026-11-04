-- Winners outside the platform's Stripe transfer region claim via Wise:
-- we store the Wise transfer id while the payout is in-flight so the result
-- page can sync its status (completed → paid, bounced → claimable again).
ALTER TABLE public.payouts
  ADD COLUMN wise_transfer_id bigint;
