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

try:  # twikit transaction-id patch (see twikit_patch.py) — no-op if absent
    import twikit_patch
    twikit_patch.apply()
except Exception:
    pass

SUPA = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_KEY"]
COOKIES_DIR = Path(os.environ.get("COOKIES_DIR", "cookies"))
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "300"))
MAX_PAGES = 10  # safety cap: ~200 replies per sweep per campaign
FULL_SCAN_EVERY = 3600  # force a full reply scan hourly even when reply_count is flat
LAST_FULL: dict[str, float] = {}  # campaign_id -> last full-scan timestamp
MAX_REPLIERS = 1000  # raffle pool cap: first 1000 visible repliers in X's order

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
    hdrs = {**HDRS, **kw.pop("headers", {})}
    async with httpx.AsyncClient(timeout=30) as c:
        res = await c.request(method, f"{SUPA}/rest/v1/{path}", headers=hdrs, **kw)
    if res.status_code >= 400:
        raise RuntimeError(f"{method} {path} -> {res.status_code}: {res.text[:200]}")
    return res


def _walk(obj, key):
    """Yield every value bound to `key` anywhere in a nested structure."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key:
                yield v
            yield from _walk(v, key)
    elif isinstance(obj, list):
        for v in obj:
            yield from _walk(v, key)


def _num(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _tweet_result(node):
    """itemContent → tweet dict, unwrapping visibility-result nesting."""
    r = ((node or {}).get("tweet_results") or {}).get("result")
    if not isinstance(r, dict):
        return None
    if isinstance(r.get("tweet"), dict):
        r = r["tweet"]  # TweetWithVisibilityResults
    return r


def parse_detail(response, tid: str, focal_seen: bool, thread_ids: set):
    """One TweetDetail page → (stats|None, replies[rid→row], cursor|None,
    focal_seen). Tweets before the focal entry are ancestors, not replies."""
    entries = []
    for e in _walk(response, "entries"):
        if isinstance(e, list):
            entries += e
    for e in _walk(response, "entry"):
        if isinstance(e, dict):
            entries.append(e)

    stats, replies, cursor = None, {}, None
    focal_handle = None
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        eid = str(entry.get("entryId") or entry.get("entry_id") or "")
        content = entry.get("content") or {}
        if eid.startswith("cursor"):
            v = ((content.get("itemContent") or {}).get("value")) or content.get("value")
            if v and ("bottom" in eid or cursor is None):
                cursor = v
            continue
        # Every item in a conversationthread is a reply in the chain —
        # items[0] is the direct reply to the focal tweet; skipping it (as
        # twikit does for its own sub-reply purposes) drops all repliers.
        nodes = (
            [(i.get("item") or {}).get("itemContent") for i in content["items"] if isinstance(i, dict)]
            if isinstance(content.get("items"), list)
            else [content.get("itemContent")]
        )
        for node in nodes:
            t = _tweet_result(node)
            if not t:
                continue
            rid = str(t.get("rest_id") or (t.get("legacy") or {}).get("id_str") or "")
            if not rid:
                continue
            legacy = t.get("legacy") or {}
            if rid == tid:
                stats = {
                    "likes": _num(legacy.get("favorite_count")),
                    "replies": _num(legacy.get("reply_count")),
                    "reposts": _num(legacy.get("retweet_count")),
                    "quotes": _num(legacy.get("quote_count")),
                    "views": _num((t.get("views") or {}).get("count")),
                }
                fa = ((t.get("core") or {}).get("user_results") or {}).get("result") or {}
                focal_handle = ((fa.get("legacy") or {}).get("screen_name") or "").lower() or focal_handle
                focal_seen = True
                continue
            if not focal_seen:
                continue  # ancestor of the focal tweet, not a reply
            u = ((t.get("core") or {}).get("user_results") or {}).get("result") or {}
            ulegacy = u.get("legacy") or {}
            handle = (ulegacy.get("screen_name") or "").lower()
            if not handle or rid in replies:
                continue
            if t.get("promotedMetadata"):
                continue  # paid injection
            parent = legacy.get("in_reply_to_status_id_str") or ""
            if parent != tid and parent not in thread_ids:
                continue  # not part of this conversation (promoted/related module)
            thread_ids.add(rid)  # real reply — nested replies may attach to it
            if focal_handle and handle == focal_handle:
                continue  # the campaign owner's own replies can't enter their raffle
            replies[rid] = {
                "reply_id": rid,
                "handle": handle,
                "x_verified": u.get("is_blue_verified", ulegacy.get("is_blue_verified")),
                "author_name": ulegacy.get("name"),
                "text": legacy.get("full_text"),
                "reply_time": legacy.get("created_at"),
            }
    return stats, replies, cursor, focal_seen


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


async def upsert_stats(tid: str, stats: dict) -> None:
    row = {"tweet_id": tid, **stats,
           "checked_at": datetime.now(timezone.utc).isoformat()}
    await rest(
        "POST",
        "tweet_stats?on_conflict=tweet_id",
        json=row,
        headers={**HDRS, "Prefer": "resolution=merge-duplicates"},
    )


async def poll_campaign(client, camp: dict) -> None:
    """twikit is transport only (gql.tweet_detail signs requests with our
    cookies); JSON is parsed by parse_detail — immune to twikit's model
    drift, which is what kept breaking."""
    cid, url = camp["id"], camp["tweet_url"]
    tid = tweet_id(url)
    if not tid:
        return
    response, _ = await client.gql.tweet_detail(tid, None)
    if not isinstance(response, dict) or response.get("errors"):
        return  # gone/protected — the worker's oEmbed probe handles cancellation

    thread_ids = {tid}
    stats, replies, cursor, focal = parse_detail(response, tid, False, thread_ids)
    if not focal:
        return
    prev = None
    try:
        pr = await rest("GET", f"tweet_stats?tweet_id=eq.{tid}&select=replies&limit=1")
        j = pr.json()
        if isinstance(j, list) and j:
            prev = j[0].get("replies")
    except Exception:
        prev = None
    if stats:
        await upsert_stats(tid, stats)

    # Most sweeps bring zero new repliers: when the reply_count parsed on
    # page 1 matches what we stored, pages 2+ cannot contain anyone new —
    # skip them (~70% fewer calls). A delete+reply swap keeps the count
    # flat, so force a full scan once an hour; count changes always scan.
    known = await known_handles(cid)
    now = datetime.now(timezone.utc).timestamp()
    if (
        len(known) < MAX_REPLIERS
        and (
            stats is None
            or stats.get("replies") != prev
            or now - LAST_FULL.get(cid, 0) > FULL_SCAN_EVERY
        )
    ):
        LAST_FULL[cid] = now
        pages = 0
        while cursor and pages < MAX_PAGES:
            pages += 1
            await asyncio.sleep(random.uniform(1, 2))
            try:
                response, _ = await client.gql.tweet_detail(tid, cursor)
            except Exception:
                break
            _, more, cursor, focal = parse_detail(response, tid, focal, thread_ids)
            replies.update(more)
            if not more:
                break

    rows = []
    for rid, r in replies.items():
        if len(known) >= MAX_REPLIERS:
            break  # raffle pool capped — later repliers in X's order don't enter
        if r["handle"] in known:
            continue
        known.add(r["handle"])
        rows.append({
            "campaign_id": cid,
            "user_id": None,
            "handle": r["handle"],
            "post_url": f"https://x.com/i/status/{rid}",
            "platform": "x",
            "eligibility_status": "verified",
            "verification_source": "reply-import",
            "fetched_meta": {
                "reply_id": rid,
                "x_verified": r["x_verified"],
                "author_name": r["author_name"],
                "text": r["text"],
                "reply_time": r["reply_time"],
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
    """Probe real READ capability on the transport layer — suspended
    accounts may fail account endpoints while still serving public GraphQL
    reads. Tweet 20 is X's oldest, always public."""
    try:
        resp, _ = await c["client"].gql.tweet_detail("20", None)
        return isinstance(resp, dict) and bool(resp.get("data"))
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
    import twikit_patch
    twikit_patch.apply()
    from twikit import Client

    creds = {}
    af = COOKIES_DIR.parent / "accounts.json"
    if af.exists():
        for a in json.loads(af.read_text(encoding="utf-8-sig")):
            creds[a["name"]] = a

    clients = []
    for f in sorted(COOKIES_DIR.glob("*.json")):
        c = Client("en-US")
        try:
            c.set_cookies(json.loads(f.read_text(encoding="utf-8-sig")))
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
            try:
                ok = await asyncio.wait_for(alive(c), timeout=30)
            except asyncio.TimeoutError:
                ok = False
            if not ok and not await revive(c):
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
        # Deterministic sharding: campaign UUID hex mod live accounts picks
        # its account — stable across sweeps/restarts, spreads X load per
        # account, and a dead account's campaigns redistribute to survivors.
        ordered = sorted(live, key=lambda c: c["name"])
        shards: dict[str, list[dict]] = {c["name"]: [] for c in ordered}
        for camp in campaigns if ordered else []:
            h = int(camp["id"].replace("-", ""), 16)
            shards[ordered[h % len(ordered)]["name"]].append(camp)
        if campaigns and ordered:
            log("shard: " + ", ".join(f"{n}<-{len(s)}" for n, s in shards.items()))

        async def work(c: dict, mine: list[dict]) -> None:
            for camp in mine:
                try:
                    await asyncio.wait_for(poll_campaign(c["client"], camp), timeout=180)
                except asyncio.TimeoutError:
                    log(f"campaign {camp['id']} via {c['name']}: timed out, skipped")
                except Exception as e:
                    log(f"campaign {camp['id']} via {c['name']}: {e}")
                await asyncio.sleep(random.uniform(2, 4))  # human-ish pacing

        # Shards run in parallel — each account still serialises its own
        # requests, so wall-clock drops by account count without raising
        # per-account request rate.
        await asyncio.gather(*(work(c, shards[c["name"]]) for c in ordered))
        await asyncio.sleep(POLL_SECONDS)


if __name__ == "__main__":
    asyncio.run(main())
