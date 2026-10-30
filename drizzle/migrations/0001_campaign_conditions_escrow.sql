ALTER TABLE public.campaigns
  ADD COLUMN tweet_url text,
  ADD COLUMN conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN prize_amount numeric,
  ADD COLUMN currency text NOT NULL DEFAULT 'USDT',
  ADD COLUMN escrow_status text NOT NULL DEFAULT 'none';

CREATE TABLE public.condition_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  progress numeric NOT NULL DEFAULT 0
);

GRANT SELECT ON public.condition_snapshots TO anon;
GRANT SELECT, INSERT ON public.condition_snapshots TO authenticated;
GRANT ALL ON public.condition_snapshots TO service_role;

ALTER TABLE public.condition_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read condition snapshots"
  ON public.condition_snapshots FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Owners can insert condition snapshots"
  ON public.condition_snapshots FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_id AND c.owner_id = auth.uid()
  ));