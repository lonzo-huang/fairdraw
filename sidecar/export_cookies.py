#!/usr/bin/env python3
"""Export x.com cookies for the FairDraw poller — run LOCALLY (Windows).

Opens your installed Chrome in a dedicated profile. Log each throwaway
account in via SSO (Google/Apple), press Enter here to save its cookies,
log out in the browser, repeat for the next account.

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
        try:
            page = ctx.pages[0] if ctx.pages else await ctx.new_page()
            await page.goto("https://x.com/login")

            seen: set[str] = set()
            n = 0
            while True:
                ans = input(
                    f"\n[{n + 1}] 在浏览器里登录小号（SSO 也行）后按 Enter 保存；"
                    "导下一个先在 x.com 退出再登新号。输入 q 结束: "
                ).strip().lower()
                if ans == "q":
                    break
                cookies = await ctx.cookies("https://x.com")
                d = {c["name"]: c["value"] for c in cookies}
                token = d.get("auth_token")
                if not token:
                    print("  ! 没读到 auth_token — 确认登录完成（页面不是登录页）再按回车")
                    continue
                if token in seen:
                    print("  ! 和上一个号相同，没切换账号？跳过")
                    continue
                n += 1
                seen.add(token)
                f = OUT / f"acct{n}.json"
                f.write_text(json.dumps(d, indent=1))
                print(f"  ✓ {f}（{len(d)} 个 cookie）— 现在在浏览器里退出，登录下一个小号")
        finally:
            await ctx.close()
    print(f"\n完成：{n} 个号 → {OUT}/，scp 到 VPS 的 ~/fairdraw-poller/cookies/")


if __name__ == "__main__":
    asyncio.run(main())
