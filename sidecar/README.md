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

Log the throwaway account into x.com in a browser, then grab from DevTools →
Application → Cookies → https://x.com:

```json
{"auth_token": "...", "ct0": "...", "guest_id": "...", "twid": "..."}
```

`auth_token` + `ct0` are the minimum; include the full cookie set if you can.
Each `*.json` in `cookies/` becomes one rotating client — 3–5 low-value
accounts spread the request load.

## Notes

- poller exits on fatal errors; systemd restarts it.
- A deleted/protected campaign tweet returns no tweet object — the worker's
  oEmbed probe owns cancellation; the poller just skips it.
- X collapses some giveaway replies under "more replies" — best effort, not
  guaranteed 100% enumeration.
