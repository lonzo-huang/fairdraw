#!/usr/bin/env python3
"""Dump the raw TweetDetail entry structure for a campaign tweet — shows
what parse_detail is working with: entry ids, tweet_results count, cursor
locations. Run on the VPS:

    ./.venv/bin/python debug_detail.py 2116664301926686776
"""
import asyncio
import json
import sys
from pathlib import Path

import twikit_patch

twikit_patch.apply()

from twikit import Client


def walk(obj, key):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key:
                yield v
            yield from walk(v, key)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk(v, key)


async def main() -> None:
    tid = sys.argv[1] if len(sys.argv) > 1 else "20"
    f = sorted(Path("cookies").glob("*.json"))[0]
    c = Client("en-US")
    c.set_cookies(json.loads(f.read_text(encoding="utf-8-sig")))

    resp, _ = await c.gql.tweet_detail(tid, None)
    entries = []
    for e in walk(resp, "entries"):
        if isinstance(e, list):
            entries += e
    for e in walk(resp, "entry"):
        if isinstance(e, dict):
            entries.append(e)

    print(f"total entries: {len(entries)}")
    for i, en in enumerate(entries):
        if not isinstance(en, dict):
            continue
        eid = str(en.get("entryId") or en.get("entry_id") or "?")
        content = en.get("content") or {}
        n_items = len(content.get("items") or [])
        has_tr = bool(list(walk(en, "tweet_results")))
        cur = (content.get("itemContent") or {}).get("value") or content.get("value")
        print(f"  [{i}] {eid[:60]}  items={n_items} tweet_results={'Y' if has_tr else '-'} cursor={'Y' if cur else '-'}")

    tweets = list(walk(resp, "tweet_results"))
    print(f"tweet_results nodes: {len(tweets)}")


if __name__ == "__main__":
    asyncio.run(main())
