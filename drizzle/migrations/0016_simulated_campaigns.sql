-- Simulated ("demo") campaigns: no pool funding, winners never paid out.
-- They run the full draw/verification flow but skip escrow entirely.
alter table public.campaigns
  add column if not exists is_simulated boolean not null default false;

comment on column public.campaigns.is_simulated is
  'Demo mode: pool is declared but never funded; winners receive nothing.';
