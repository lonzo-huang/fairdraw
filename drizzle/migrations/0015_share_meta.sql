-- Share/tweet generation params saved with the campaign so the card and text
-- can be regenerated later (re-post, re-download) with the same look.
alter table public.campaigns
  add column if not exists share_meta jsonb;

comment on column public.campaigns.share_meta is
  'Tweet composer state: {body, reply, alt, size, theme, tone, tags} captured at creation.';
