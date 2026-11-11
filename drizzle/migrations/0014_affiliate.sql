-- Affiliate program: referrers earn 30% of per-campaign NET revenue
-- (platform fee minus the campaign's direct costs) — never a share of gross.

create table public.referrers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  x_handle text,
  payout_address text,
  verified_at timestamptz,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.referral_clicks (
  id bigint generated always as identity primary key,
  referrer_id uuid not null references public.referrers(user_id) on delete cascade,
  code text not null,
  ua text,
  created_at timestamptz not null default now()
);
create index referral_clicks_ref_idx on public.referral_clicks (referrer_id, created_at);

-- One referrer per signed-up user; last click wins (upsert on referred_id).
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.referrers(user_id) on delete cascade,
  referred_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null,
  bound_at timestamptz not null default now()
);
create index referrals_referrer_idx on public.referrals (referrer_id, bound_at);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id) on delete cascade,
  referrer_id uuid not null references public.referrers(user_id) on delete cascade,
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  fee numeric not null,
  cost numeric not null,
  net numeric not null,
  amount numeric not null,
  currency text not null default 'USDT',
  status text not null default 'pending' check (status in ('pending','confirmed','paid','void')),
  settle_after timestamptz not null,
  paid_at timestamptz,
  paid_tx text,
  created_at timestamptz not null default now()
);
create index commissions_referrer_idx on public.commissions (referrer_id, status);

alter table public.referrers enable row level security;
alter table public.referral_clicks enable row level security;
alter table public.referrals enable row level security;
alter table public.commissions enable row level security;

-- Members read their own rows; all writes go through service-role server fns.
create policy "referrers_select_own" on public.referrers for select using (auth.uid() = user_id);
create policy "referrals_select_own" on public.referrals for select using (auth.uid() = referrer_id or auth.uid() = referred_id);
create policy "commissions_select_own" on public.commissions for select using (auth.uid() = referrer_id);
-- referral_clicks: no client access at all.
