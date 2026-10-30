# Supabase setup (self-managed)

FairDraw now talks to a standard Supabase project — no Lovable Cloud required.
Everything below runs on the Supabase free tier.

## 1. Create the project

1. https://supabase.com → New project → pick a region close to your users.
2. Wait for the database to provision (~2 min).

## 2. Run migrations

Dashboard → **SQL Editor** → paste and run each file in `drizzle/migrations/`,
in filename order:

```
0000_migration.sql
0001_campaign_conditions_escrow.sql
0002_campaign_share_metadata.sql
0003_public_profile_read.sql
0004_fee_tiers_admin.sql
0005_payments_wallets.sql
0006_stripe_connect.sql
0007_payout_claim_info.sql
```

`0000` seeds the default fee tiers and roles; the rest add tables/columns and
row-level-security policies. Run each once — re-running old ones will error,
which is fine to ignore.

## 3. Keys

Dashboard → **Project Settings → API Keys**:

- `Publishable key` (`sb_publishable_…`) → goes in `.env` and Vercel env vars.
- `Secret key` (`sb_secret_…`) → `SUPABASE_SERVICE_ROLE_KEY`. **Never commit it**
  and never put it in a `VITE_` variable — it bypasses all row-level security.
  Local: `.env.local` (gitignored). Prod: Vercel env vars.

## 4. Auth providers

Dashboard → **Authentication → Sign In / Providers**:

- **Email** — on by default.
- **Google** — enable, paste OAuth client ID/secret from Google Cloud Console.
  The provider page shows the callback URL to register:
  `https://<your-project>.supabase.co/auth/v1/callback`
- **Twitter (X)** — enable, paste OAuth 2.0 client ID/secret from the X
  developer portal (user auth: OAuth 2.0, type "Web App").

Dashboard → **Authentication → URL Configuration**:

- Site URL: `https://<your-vercel-domain>` (add `http://localhost:5173` in dev)
- Redirect URLs: `https://<your-vercel-domain>/**` and `http://localhost:5173/**`

X sign-in also powers winner verification: the verified X username from the
OAuth identity must match the winning handle at claim time.

### Re-enable email sign-in

Email/password sign-in is intentionally hidden — the sign-in page is
OAuth-only (Google + X). To restore it:

1. `src/routes/auth.tsx`: set `EMAIL_AUTH_ENABLED` to `true`.
2. Supabase → Authentication → Providers → Email stays enabled; optionally
   toggle "Confirm email" under Email settings.

No other code change needed — the handler (`submit`) and i18n strings are
still in place.

## 5. Environment variables

`.env` (safe to commit — public keys only):

```env
SUPABASE_PROJECT_ID="<ref>"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_…"
SUPABASE_URL="https://<ref>.supabase.co"
VITE_SUPABASE_PROJECT_ID="<ref>"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_…"
VITE_SUPABASE_URL="https://<ref>.supabase.co"
```

`.env.local` and **Vercel → Settings → Environment Variables** (secrets):

```env
SUPABASE_SERVICE_ROLE_KEY="sb_secret_…"   # required — server admin client
STRIPE_SECRET_KEY="sk_…"                  # Stripe funding + Connect payouts
STRIPE_WEBHOOK_SECRET="whsec_…"           # /api/stripe/webhook
X_BEARER_TOKEN="…"                        # optional — X API; falls back to oEmbed
CHAIN_RPC_URL="…"                         # optional — custom BSC RPC
```

Also mirror the `VITE_*` and `SUPABASE_*` public vars in Vercel, plus
`VITE_PLATFORM_WALLET` if you want on-chain USDT funding.

## 6. Stripe webhook (if using Stripe)

Stripe Dashboard → Developers → Webhooks → add endpoint:
`https://<your-vercel-domain>/api/stripe/webhook`, event
`checkout.session.completed`. Copy the signing secret into
`STRIPE_WEBHOOK_SECRET`.

## Data migration from Lovable Cloud (optional)

Fresh start needs nothing. To move existing data: Lovable Cloud → export each
table as CSV, then Supabase Dashboard → Table Editor → Import CSV, or
`pg_dump --data-only` → `psql` restore into the new project.
