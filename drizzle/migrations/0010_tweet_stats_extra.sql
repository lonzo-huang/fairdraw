-- Extend poller-written tweet stats with bookmarks and author followers
-- (feeds the campaign analytics "bookmarks" and "new followers" metrics).
alter table public.tweet_stats add column if not exists bookmarks int;
alter table public.tweet_stats add column if not exists followers bigint;
