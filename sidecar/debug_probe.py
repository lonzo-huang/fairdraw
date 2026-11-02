#!/usr/bin/env python3
"""Diagnose why a cookies.json client can't read — prints the real
traceback that poller.py's except-block swallows. Probes the same
transport call the poller uses (gql.tweet_detail). Run on the VPS:

    ./.venv/bin/python debug_probe.py
"""
import asyncio
import json
import traceback
from pathlib import Path

import twikit_patch

twikit_patch.apply()

from twikit import Client


async def main() -> None:
    for f in sorted(Path("cookies").glob("*.json")):
        c = Client("en-US")
        try:
            c.set_cookies(json.loads(f.read_text(encoding="utf-8-sig")))
        except Exception as e:
            print(f"{f.name}: cookie load failed: {e}")
            continue
        try:
            resp, _ = await c.gql.tweet_detail("20", None)
            ok = isinstance(resp, dict) and bool(resp.get("data"))
            keys = list(resp)[:6] if isinstance(resp, dict) else type(resp)
            print(f"{f.name}: READ {'OK' if ok else 'EMPTY'} - top keys: {keys}")
        except Exception:
            print(f"{f.name}: READ FAIL")
            traceback.print_exc(limit=6)


if __name__ == "__main__":
    asyncio.run(main())
