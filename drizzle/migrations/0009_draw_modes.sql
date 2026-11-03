alter table public.campaigns
  add column if not exists draw_mode text not null default 'all',
  add column if not exists draw_weights jsonb;
