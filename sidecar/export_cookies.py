#!/usr/bin/env python3
"""Export x.com cookies for the FairDraw poller — run LOCALLY (Windows).

Opens your installed Chrome in a dedicated profile. Log each throwaway
account in via SSO (Google/Apple) — the script detects auth_token changes
and saves automatically. Log out on x.com to export the next account.
Ctrl+C when done.

    pip install playwright
    python export_cookies.py

Writes cookies_export/acct1.json, acct2.json, ... — scp them into the VPS:
    scp -i vps\\ssh-key-*.key cookies_export\\*.json ubuntu@VPS:~/fairdraw-poller/cookies/
"""
import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright

OUT = Path("cookies_export")
PROFILE = Path(".x-export-profile")  # dedicated profile, never touches your real one


async def main() -> None:
    OUT.mkdir(exist_ok=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE),
            channel="chrome",          # uses installed Chrome — no browser download
            headless=False,
            viewport={"width": 1200, "height": 800},
            # without this, x.com detects navigator.webdriver and the
            # login button silently does nothing
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://x.com/login")
        print("在打开的 Chrome 里登录小号。检测到 auth_token 自动保存；换号导下一个。")
        print("Ctrl+C 结束。\n")

        seen: set[str] = set()
        n = 0
        try:
            while True:
                cookies = await ctx.cookies("https://x.com")
                d = {c["name"]: c["value"] for c in cookies}
                token = d.get("auth_token")
                if token and token not in seen:
                    seen.add(token)
                    n += 1
                    f = OUT / f"acct{n}.json"
                    f.write_text(json.dumps(d, indent=1))
                    print(f"  ✓ 已保存 {f}（{len(d)} 个 cookie）— 退出当前账号可导下一个")
                await asyncio.sleep(2)
        except KeyboardInterrupt:
            pass
        finally:
            await ctx.close()
    print(f"\n完成：{n} 个号 → {OUT}/，scp 到 VPS 的 ~/fairdraw-poller/cookies/")


if __name__ == "__main__":
    asyncio.run(main())
