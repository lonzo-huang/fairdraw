
-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- subscriptions (plan is not user-editable)
create table public.subscriptions (
  user_id uuid primary key,
  plan text not null default 'free' check (plan in ('free','pro','premium')),
  updated_at timestamptz not null default now()
);
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;
create policy "own sub read" on public.subscriptions for select to authenticated using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  insert into public.subscriptions (user_id) values (new.id) on conflict do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- campaigns
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  slug text not null unique default substr(replace(gen_random_uuid()::text,'-',''),1,10),
  title text not null,
  description text not null default '',
  prize text not null,
  winners_count int not null default 1 check (winners_count between 1 and 100),
  ends_at timestamptz not null,
  requirement text not null default '',
  questions jsonb not null default '[]'::jsonb,
  target_url text,
  clicks int not null default 0,
  status text not null default 'open' check (status in ('open','drawn')),
  created_at timestamptz not null default now()
);
grant select on public.campaigns to anon;
grant select, insert, update, delete on public.campaigns to authenticated;
grant all on public.campaigns to service_role;
alter table public.campaigns enable row level security;
create policy "campaigns public read" on public.campaigns for select to anon, authenticated using (true);
create policy "campaigns owner insert" on public.campaigns for insert to authenticated with check (auth.uid() = owner_id and status = 'open');
create policy "campaigns owner update" on public.campaigns for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "campaigns owner delete" on public.campaigns for delete to authenticated using (auth.uid() = owner_id and status = 'open');

create or replace function public.plan_weekly_limit(_plan text)
returns int language sql immutable as $$
  select case _plan when 'premium' then 20 when 'pro' then 5 else 1 end
$$;

create or replace function public.enforce_campaign_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare _plan text; _used int;
begin
  select coalesce((select plan from public.subscriptions where user_id = new.owner_id),'free') into _plan;
  select count(*) into _used from public.campaigns
   where owner_id = new.owner_id
     and created_at >= date_trunc('week', now() at time zone 'utc') at time zone 'utc';
  if _used >= public.plan_weekly_limit(_plan) then
    raise exception 'WEEKLY_LIMIT_REACHED';
  end if;
  new.status := 'open'; new.clicks := 0; new.created_at := now();
  return new;
end; $$;
create trigger campaigns_quota before insert on public.campaigns for each row execute function public.enforce_campaign_quota();

-- prevent owners from flipping status/clicks directly
create or replace function public.protect_campaign_fields()
returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' then
    new.status := old.status; new.clicks := old.clicks; new.owner_id := old.owner_id; new.created_at := old.created_at;
    if old.status = 'drawn' then
      new.ends_at := old.ends_at; new.winners_count := old.winners_count;
    end if;
  end if;
  return new;
end; $$;
create trigger campaigns_protect before update on public.campaigns for each row execute function public.protect_campaign_fields();

create or replace function public.weekly_usage()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.campaigns
   where owner_id = auth.uid()
     and created_at >= date_trunc('week', now() at time zone 'utc') at time zone 'utc'
$$;
grant execute on function public.weekly_usage() to authenticated;

create or replace function public.register_click(_slug text)
returns text language plpgsql security definer set search_path = public as $$
declare _url text;
begin
  update public.campaigns set clicks = clicks + 1 where slug = _slug and target_url is not null returning target_url into _url;
  return _url;
end; $$;
grant execute on function public.register_click(text) to anon, authenticated;

-- entries
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null,
  handle text not null,
  post_url text not null,
  platform text not null default 'other',
  answers jsonb not null default '[]'::jsonb,
  eligibility_status text not null default 'unverified' check (eligibility_status in ('unverified','verified','eligible','ineligible')),
  verification_source text,
  fetched_meta jsonb,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);
grant select, insert, update, delete on public.entries to authenticated;
grant all on public.entries to service_role;
alter table public.entries enable row level security;
create policy "entries own read" on public.entries for select to authenticated using (auth.uid() = user_id);
create policy "entries owner read" on public.entries for select to authenticated using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()));
create policy "entries own insert" on public.entries for insert to authenticated with check (
  auth.uid() = user_id and eligibility_status = 'unverified'
  and exists (select 1 from public.campaigns c where c.id = campaign_id and c.status = 'open' and c.ends_at > now()));
create policy "entries own delete" on public.entries for delete to authenticated using (
  auth.uid() = user_id and exists (select 1 from public.campaigns c where c.id = campaign_id and c.status = 'open'));
create policy "entries owner update" on public.entries for update to authenticated using (
  exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid() and c.status = 'open'));

create or replace function public.entry_count(_campaign_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.entries where campaign_id = _campaign_id
$$;
grant execute on function public.entry_count(uuid) to anon, authenticated;

-- draws (written only by server)
create table public.draws (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  list_hash text not null,
  seed text not null,
  drawn_at timestamptz not null,
  candidates jsonb not null,
  winners jsonb not null,
  created_at timestamptz not null default now()
);
grant select on public.draws to anon, authenticated;
grant all on public.draws to service_role;
alter table public.draws enable row level security;
create policy "draws public read" on public.draws for select to anon, authenticated using (true);

-- payouts
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  winner_handle text not null,
  status text not null default 'pending' check (status in ('pending','paid')),
  proof text,
  note text,
  updated_at timestamptz not null default now(),
  unique (campaign_id, winner_handle)
);
grant select on public.payouts to anon;
grant select, insert, update, delete on public.payouts to authenticated;
grant all on public.payouts to service_role;
alter table public.payouts enable row level security;
create policy "payouts public read" on public.payouts for select to anon, authenticated using (true);
create policy "payouts owner write" on public.payouts for all to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()));
