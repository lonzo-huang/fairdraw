---
description: deploy the X reply-import poller to the VPS and restart its service
---

VPS connection (also in .env.local): host 92.5.46.148, user ubuntu, key `vps/fairdraw-poller.key` (ed25519, gitignored). Poller lives at `/home/ubuntu/fairdraw-poller/poller.py`, runs under systemd unit `fairdraw-poller.service` with `/home/ubuntu/fairdraw-poller/.venv/bin/python`.

1. Copy the edited poller to the VPS:
// turbo
2. `scp -o BatchMode=yes -i vps\fairdraw-poller.key sidecar\poller.py ubuntu@92.5.46.148:/home/ubuntu/fairdraw-poller/poller.py`
3. Syntax-check, restart, and verify on the VPS:
// turbo
4. `ssh -o BatchMode=yes -i vps\fairdraw-poller.key ubuntu@92.5.46.148 "cd /home/ubuntu/fairdraw-poller && .venv/bin/python -m py_compile poller.py && sudo systemctl restart fairdraw-poller && sleep 2 && systemctl is-active fairdraw-poller && journalctl -u fairdraw-poller -n 5 --no-pager"`
5. To just read logs: `ssh ... "journalctl -u fairdraw-poller -n 50 --no-pager"`.

Note: PowerShell does not support `&&` — run the scp and ssh steps as separate commands.
