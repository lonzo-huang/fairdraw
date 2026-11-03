#!/usr/bin/env python3
"""One-off reconciliation: re-fetch each open campaign's TweetDetail,
rebuild the true reply set with the chain-validated parse_detail, and
DELETE reply-import entries whose reply_id is not in it (ads/related-
tweet injections imported before the in_reply_to chain filter).

Run on the VPS with the poller env loaded:
    cd ~/fairdraw-poller && set -a && . ./.env && set +a && \
    ./.venv/bin/python prune_entries.py
"""
import asyncio
import json
import random
import re

from poller import (
    MAX_PAGES,
    load_clients,
    log,
    open_campaigns,
    parse_detail,
    rest,
    tweet_id,
)

ENTRY_ID_RE = re.compile(r"status/(\d+)")


async def true_reply_ids(client, tid: str) -> set[str]:
    thread_ids = {tid}
    valid: set[str] = set()
    try:
        resp, _ = await client.gql.tweet_detail(tid, None)
    except Exception as e:
        log(f"{tid}: first page failed: {e}")
        return set()
    if not isinstance(resp, dict) or resp.get("errors"):
        return set()
    _, replies, cursor, focal = parse_detail(resp, tid, False, thread_ids)
    if not focal:
        return set()
    valid |= replies.keys()
    pages = 0
    while cursor and pages < MAX_PAGES:
        pages += 1
        await asyncio.sleep(random.uniform(1, 2))
        try:
            resp, _ = await client.gql.tweet_detail(tid, cursor)
        except Exception:
            break
        _, more, cursor, focal = parse_detail(resp, tid, focal, thread_ids)
        valid |= more.keys()
        if not more:
            break
    return valid


async def main() -> None:
    clients = await load_clients()
    if not clients:
        log("no accounts")
        return
    client = clients[0]["client"]
    for camp in await open_campaigns():
        tid = tweet_id(camp["tweet_url"])
        if not tid:
            continue
        valid = await true_reply_ids(client, tid)
        res = await rest(
            "GET",
            f"entries?campaign_id=eq.{camp['id']}&verification_source=eq.reply-import&select=id,handle,post_url",
        )
        entries = res.json()
        dropped = []
        for e in entries:
            m = ENTRY_ID_RE.search(e.get("post_url") or "")
            rid = m.group(1) if m else ""
            if valid and rid not in valid:
                await rest("DELETE", f"entries?id=eq.{e['id']}")
                dropped.append(e["handle"])
        log(f"{camp['id']}: {len(valid)} valid replies, {len(entries)} entries, dropped {len(dropped)}: {dropped[:10]}")
        await asyncio.sleep(1)


if __name__ == "__main__":
    asyncio.run(main())
