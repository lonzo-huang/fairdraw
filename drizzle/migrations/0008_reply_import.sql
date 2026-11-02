-- Reply-import support (VPS poller auto-enters X repliers).
-- Imported repliers have no FairDraw account, so user_id becomes nullable.
alter table public.entries alter column user_id drop not null;

-- One entry per X handle per campaign: replying twice still counts once.
create unique index if not exists entries_campaign_handle_key
  on public.entries (campaign_id, handle);

-- Latest metrics for a campaign tweet, written by the off-worker poller.
create table public.tweet_stats (
  tweet_id text primary key,
  likes int,
  replies int,
  reposts int,
  quotes int,
  views bigint,
  checked_at timestamptz not null default now()
);
grant all on public.tweet_stats to service_role;
alter table public.tweet_stats enable row level security;
