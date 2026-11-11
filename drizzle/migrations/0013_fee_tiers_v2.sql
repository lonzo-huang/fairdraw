-- New fee schedule. min_amount is now an EXCLUSIVE bound (pool must exceed it):
-- <=5 20% | <=50 12% | <=100 10% | <=500 8% | <=1000 6% | >1000 5%.
delete from public.fee_tiers;
insert into public.fee_tiers (min_amount, rate_percent) values
  (0, 20), (5, 12), (50, 10), (100, 8), (500, 6), (1000, 5);
