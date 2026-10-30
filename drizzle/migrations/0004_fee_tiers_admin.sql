DROP TRIGGER IF EXISTS campaigns_quota ON public.campaigns;
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.fee_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_amount numeric NOT NULL DEFAULT 0 CHECK (min_amount >= 0),
  rate_percent numeric NOT NULL CHECK (rate_percent >= 0 AND rate_percent <= 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fee_tiers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fee_tiers TO authenticated;
GRANT ALL ON public.fee_tiers TO service_role;
ALTER TABLE public.fee_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads fee tiers" ON public.fee_tiers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins insert fee tiers" ON public.fee_tiers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update fee tiers" ON public.fee_tiers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete fee tiers" ON public.fee_tiers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.fee_tiers (min_amount, rate_percent) VALUES (0, 8), (500, 6), (2000, 4);