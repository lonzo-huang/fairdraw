#!/usr/bin/env python3
"""FairDraw reply-import poller.

Every POLL_SECONDS it scans open campaigns that have a campaign tweet, fetches
the tweet's stats + replies via Twikit (cookie-authenticated GraphQL), upserts
tweet_stats, and enters each replier into `entries` (one row per X handle).

Env:
  SUPABASE_URL          project URL (https://xxxx.supabase.co)
  SUPABASE_SERVICE_KEY  service_role key (writes bypass RLS)
  COOKIES_DIR           dir holding one cookies.json per X account (default: ./cookies)
  POLL_SECONDS          interval between sweeps (default: 300)
"""
import asyncio
import json
import os
import random
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

SUPA = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_KEY"]
COOKIES_DIR = Path(os.environ.get("COOKIES_DIR", "cookies"))
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "300"))
MAX_PAGES = 10  # safety cap: ~200 replies per sweep per campaign

HDRS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
}

TWEET_ID_RE = re.compile(r"(?:x|twitter)\.com/[^/]+/status(?:es)?/(\d+)", re.I)


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {msg}", flush=True)


def tweet_id(url: str) -> str | None:
    m = TWEET_ID_RE.search(url or "")
    return m.group(1) if m else None


async def rest(method: str, path: str, **kw) -> httpx.Response:
    async with httpx.AsyncClient(timeout=30) as c:
        res = await c.request(method, f"{SUPA}/rest/v1/{path}", headers=HDRS, **kw)
    if res.status_code >= 400:
        raise RuntimeError(f"{method} {path} -> {res.status_code}: {res.text[:200]}")
    return res


def stat(tweet, *names):
    for n in names:
        v = getattr(tweet, n, None)
        if isinstance(v, (int, float)):
            return int(v)
    return None


async def open_campaigns() -> list[dict]:
    res = await rest(
        "GET",
        "campaigns?status=eq.open&tweet_url=not.is.null&select=id,tweet_url,ends_at",
    )
    return res.json()


async def known_handles(campaign_id: str) -> set[str]:
    res = await rest(
        "GET",
        f"entries?campaign_id=eq.{campaign_id}&select=handle",
    )
    return {str(r["handle"]).lower() for r in res.json() if r.get("handle")}


async def upsert_stats(tid: str, tweet) -> None:
    row = {
        "tweet_id": tid,
        "likes": stat(tweet, "favorite_count", "like_count"),
        "replies": stat(tweet, "reply_count"),
        "reposts": stat(tweet, "retweet_count"),
        "quotes": stat(tweet, "quote_count"),
        "views": stat(tweet, "view_count"),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    await rest(
        "POST",
        "tweet_stats?on_conflict=tweet_id",
        json=row,
        headers={**HDRS, "Prefer": "resolution=merge-duplicates"},
    )


async def replies_of(tweet, tid: str, client):
    """Yield reply Tweet objects across pages until exhausted or cap."""
    pages = 0
    result = getattr(tweet, "replies", None)
    if not result and hasattr(client, "get_tweet_replies"):
        result = await client.get_tweet_replies(tid)
    while result:
        for r in result:
            yield r
        pages += 1
        if pages >= MAX_PAGES:
            return
        try:
            result = await result.next()
        except Exception:
            return


async def poll_campaign(client, camp: dict) -> None:
    cid, url = camp["id"], camp["tweet_url"]
    tid = tweet_id(url)
    if not tid:
        return
    tweet = await client.get_tweet_by_id(tid)
    if tweet is None:
        return  # gone/protected — the worker's oEmbed probe handles cancellation

    await upsert_stats(tid, tweet)

    known = await known_handles(cid)
    rows = []
    async for r in replies_of(tweet, tid, client):
        user = getattr(r, "user", None)
        handle = (getattr(user, "screen_name", "") or "").lower()
        if not handle or handle in known:
            continue
        known.add(handle)
        rows.append({
            "campaign_id": cid,
            "user_id": None,
            "handle": handle,
            "post_url": f"https://x.com/i/status/{r.id}",
            "platform": "x",
            "eligibility_status": "verified",
            "verification_source": "reply-import",
            "fetched_meta": {
                "reply_id": str(r.id),
                "x_verified": getattr(user, "is_blue_verified", None),
                "author_name": getattr(user, "name", None),
                "text": getattr(r, "text", None),
            },
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        })
    if rows:
        await rest(
            "POST",
            "entries?on_conflict=campaign_id,handle",
            json=rows,
            headers={**HDRS, "Prefer": "resolution=ignore-duplicates"},
        )
        log(f"campaign {cid}: +{len(rows)} repliers (total known {len(known)})")
    else:
        log(f"campaign {cid}: no new repliers")


async def alive(c: dict) -> bool:
    """Cheap auth probe — user_id() needs a valid session."""
    try:
        return (await c["client"].user_id()) is not None
    except Exception:
        return False


async def revive(c: dict) -> bool:
    """Re-login with stored creds and persist fresh cookies."""
    cred = c.get("cred")
    if not cred:
        return False
    try:
        await c["client"].login(
            auth_info_1=cred.get("email") or cred["username"],
            auth_info_2=cred.get("username"),
            password=cred["password"],
            totp_secret=cred.get("totp"),
        )
        c["client"].save_cookies(str(c["file"]))
        log(f"{c['name']}: re-login ok, cookies refreshed")
        return True
    except Exception as e:
        log(f"{c['name']}: re-login failed: {e}")
        return False


async def load_clients() -> list[dict]:
    """One Twikit client per cookies.json (account rotation).

    Optional accounts.json next to COOKIES_DIR stores credentials keyed by
    cookie-file name — enables auto re-login when cookies die, and a fresh
    login for creds that have no cookie file at all.
    """
    from twikit import Client  # deferred so --check works without twikit

    creds = {}
    af = COOKIES_DIR.parent / "accounts.json"
    if af.exists():
        for a in json.loads(af.read_text()):
            creds[a["name"]] = a

    clients = []
    for f in sorted(COOKIES_DIR.glob("*.json")):
        c = Client("en-US")
        try:
            c.load_cookies(str(f))
            clients.append({"name": f.stem, "client": c, "file": f, "cred": creds.get(f.stem)})
        except Exception as e:
            log(f"cookie {f.name} failed to load: {e}")

    # Bootstrap: credentials without a cookie file log in from scratch.
    for name, cred in creds.items():
        f = COOKIES_DIR / f"{name}.json"
        if f.exists() or any(c["name"] == name for c in clients):
            continue
        entry = {"name": name, "client": Client("en-US"), "file": f, "cred": cred}
        if await revive(entry):
            clients.append(entry)
    return clients


async def main() -> None:
    if not SUPA or not KEY:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY required")
    clients = await load_clients()
    if not clients:
        sys.exit(f"no cookies.json under {COOKIES_DIR} and no usable accounts.json — see README")
    log(f"poller up: {len(clients)} account(s), every {POLL_SECONDS}s")

    while True:
        # Per-sweep health check: dead cookies get one re-login attempt via
        # stored creds; still-dead accounts sit this sweep out.
        live = []
        for c in clients:
            if not await alive(c) and not await revive(c):
                log(f"{c['name']}: dead — needs manual attention")
                continue
            live.append(c)
        if not live:
            log("all accounts dead — nothing will be scraped this sweep")

        try:
            campaigns = await open_campaigns()
        except Exception as e:
            log(f"campaign list failed: {e}")
            campaigns = []
        for camp in campaigns if live else []:
            c = random.choice(live)
            try:
                await poll_campaign(c["client"], camp)
            except Exception as e:
                log(f"campaign {camp['id']} via {c['name']}: {e}")
            await asyncio.sleep(random.uniform(2, 4))  # human-ish pacing
        await asyncio.sleep(POLL_SECONDS)


if __name__ == "__main__":
    asyncio.run(main())
