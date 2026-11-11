-- The claim flows (chain/stripe/wise) optimistically lock a payout with
-- status 'paying' before broadcasting, but the original check only allowed
-- pending|paid — every claim threw "Payout already processing" (PGRST 23514).
alter table public.payouts drop constraint payouts_status_check;
alter table public.payouts add constraint payouts_status_check
  check (status in ('pending', 'paying', 'paid'));
