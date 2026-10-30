-- Payments & wallets: links campaigns to real money movement (Stripe checkout or on-chain USDT).

ALTER TABLE public.campaigns
  ADD COLUMN payment_method text NOT NULL DEFAULT 'manual';

ALTER TABLE public.entries
  ADD COLUMN payout_address text;

ALTER TABLE public.payouts
  ADD COLUMN wallet_address text,
  ADD COLUMN tx_hash text;

-- Linked wallet addresses (organizer funding wallet, admin payout wallet).
CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address text NOT NULL,
  chain text NOT NULL DEFAULT 'bsc',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, address)
);

GRANT SELECT, INSERT, DELETE ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wallets"
  ON public.wallets FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Every real money movement, both directions.
-- kind: 'pool' (funding), 'fee' (platform fee), 'payout', 'refund'
-- provider: 'stripe' | 'chain'
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USDT',
  external_ref text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payments_campaign_idx ON public.payments (campaign_id);
CREATE UNIQUE INDEX payments_external_ref_uq ON public.payments (provider, external_ref);

GRANT SELECT, INSERT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read payments"
  ON public.payments FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Users see own payment inserts"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
