-- Cancellation: organisers may cancel a campaign within 1 hour of publishing.
-- Campaigns that end without meeting conditions are auto-cancelled and the
-- funded pool is refunded (Stripe refund; chain refunds run through the admin).

ALTER TABLE public.campaigns
  DROP CONSTRAINT campaigns_status_check;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('open', 'drawn', 'cancelled'));

ALTER TABLE public.campaigns
  ADD COLUMN cancelled_at timestamptz;
