# FairDraw reply-import poller

Polls every open campaign tweet via Twikit (cookie-auth GraphQL), upserts
`tweet_stats` (incl. `views` the free sources lack) and enters each replier
into `entries` — one row per X handle, `eligibility_status='verified'`,
`fetched_meta.x_verified` = blue badge.

## Deploy (Ubuntu VPS)

```bash
mkdir -p ~/fairdraw-poller/cookies && cd ~/fairdraw-poller
# copy poller.py, requirements.txt, fairdraw-poller.service here (scp)

python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt

cat > poller.env <<'EOF'
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOi...service_role...
POLL_SECONDS=300
COOKIES_DIR=/home/ubuntu/fairdraw-poller/cookies
EOF
chmod 600 poller.env

sudo cp fairdraw-poller.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fairdraw-poller
journalctl -u fairdraw-poller -f   # watch logs
```

## X account cookies (one per file: cookies/account1.json)

Easy way — the bundled exporter opens your local Chrome, you SSO-login each
account, it saves the full cookie set (incl. HttpOnly `auth_token`):

```powershell
pip install playwright
python sidecar\export_cookies.py     # creates cookies_export\acct1.json, ...
```

Manual way: log in on x.com, DevTools → Application → Cookies → x.com,
save `auth_token` + `ct0` (and the rest if easy) as JSON.
Each `*.json` in `cookies/` becomes one rotating client — 3–5 low-value
accounts spread the request load.

## accounts.json — automatic cookie renewal (recommended)

Cookies die when X flags or logs out the account, not on a schedule. Put
`accounts.json` in the poller root (next to `cookies/`) and the poller
self-heals: every sweep probes `user_id()`, and dead sessions re-login via
stored credentials, saving fresh cookies back. Creds with no cookie file
log in from scratch — you can skip cookie export entirely.

```json
[
  { "name": "acct1", "username": "handle", "password": "pass", "totp": "BASE32" },
  { "name": "acct2", "username": "handle2", "password": "pass2" }
]
```

`name` must match the cookie file stem (`acct1` ↔ `cookies/acct1.json`).
`totp` is optional but recommended — login challenges with TOTP configured
resolve automatically; without it X may demand an email confirmation the
script cannot answer (account stays dead until manually fixed).
`chmod 600 accounts.json`.

## Notes

- poller exits on fatal errors; systemd restarts it.
- A deleted/protected campaign tweet returns no tweet object — the worker's
  oEmbed probe owns cancellation; the poller just skips it.
- X collapses some giveaway replies under "more replies" — best effort, not
  guaranteed 100% enumeration.
