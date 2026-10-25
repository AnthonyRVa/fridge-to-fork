"""End-to-end check of Fridge to Fork with Playwright.

Run against the local mock server:   MOCK=1 PORT=3123 node scripts/dev-server.mjs
then:                                python3 tests/ui_test.py http://localhost:3123
Or against the live site:            python3 tests/ui_test.py https://your-site.vercel.app
"""
import sys, os, re
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3123"
OUT = os.path.join(os.path.dirname(__file__), "screens")
os.makedirs(OUT, exist_ok=True)
results = []

def check(name, fn):
    try:
        fn(); results.append(("PASS", name, ""))
    except Exception as e:
        results.append(("FAIL", name, str(e).splitlines()[0][:200]))

with sync_playwright() as p:
    browser = p.chromium.launch()
    for scheme in ("light", "dark"):
        for label, vp in (("desktop", {"width": 1280, "height": 900}), ("phone", {"width": 390, "height": 844})):
            ctx = browser.new_context(viewport=vp, color_scheme=scheme)
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.goto(BASE, wait_until="networkidle")
            tag = f"{label}-{scheme}"

            check(f"[{tag}] page loads with recipes", lambda: expect(page.locator("#cards .rc[data-id]").first).to_be_visible(timeout=20000))
            check(f"[{tag}] no horizontal scroll", lambda: (lambda w: (_ for _ in ()).throw(AssertionError(f"scrollWidth {w}")) if w > vp["width"] + 1 else None)(page.evaluate("document.documentElement.scrollWidth")))
            page.screenshot(path=f"{OUT}/home-{tag}.png", full_page=False)

            if label == "desktop" and scheme == "light":
                n = page.locator("#cards .rc[data-id]").count()
                check("several recipes to choose from (>=3)", lambda: (_ for _ in ()).throw(AssertionError(f"only {n}")) if n < 3 else None)

                page.fill("#ingInput", "tortillas, lime")
                page.click("#addBtn")
                check("adding ingredients makes magnets", lambda: expect(page.locator(".mag", has_text="lime")).to_be_visible())
                page.locator(".mag", has_text="lime").locator("button").click()
                check("removing a magnet works", lambda: expect(page.locator(".mag", has_text="lime")).to_have_count(0))

                page.locator("label:has-text('Mexican')").click()
                page.click("#findBtn")
                page.wait_for_timeout(300)
                check("Mexican filter returns Mexican recipes", lambda: expect(page.locator("#cards .rc .sub").first).to_contain_text("Mexican", timeout=20000))

                page.locator("#cards .rc[data-id]").first.click()
                check("recipe sheet opens", lambda: expect(page.locator("#recipe #rTitle")).to_be_visible(timeout=15000))
                check("ingredients are marked have/buy", lambda: expect(page.locator("ul.ing .tag").first).to_be_visible())
                check("nutrition panel shows calories", lambda: expect(page.locator("#nutri .macro b").first).to_have_text(re.compile(r"^\d+$"), timeout=20000))
                btn = page.locator("#priceAll")
                btn.click()
                check("price panel shows a total", lambda: expect(page.locator("#priceOut .total b")).to_have_text(re.compile(r"^\$\d+\.\d\d$"), timeout=20000))
                page.screenshot(path=f"{OUT}/recipe-{tag}.png", full_page=False)
                page.click("#favBtn")
                check("saving updates the cookbook count", lambda: expect(page.locator("#favCount")).to_have_text("1"))
                page.click("#closeBtn")
                check("saved recipe shows in cookbook", lambda: expect(page.locator("#favs .rc")).to_have_count(1))
                page.reload(wait_until="networkidle")
                check("cookbook survives a reload", lambda: expect(page.locator("#favCount")).to_have_text("1"))

            if label == "phone" and scheme == "dark":
                page.locator("#cards .rc[data-id]").first.click()
                page.wait_for_timeout(1500)
                page.screenshot(path=f"{OUT}/recipe-{tag}.png", full_page=False)

            real = [e for e in errors if "Failed to load resource" not in e]
            check(f"[{tag}] no script errors", lambda: (_ for _ in ()).throw(AssertionError("; ".join(real)[:200])) if real else None)
            ctx.close()
    browser.close()

for r in results:
    print(f"{r[0]}  {r[1]}" + (f"  -> {r[2]}" if r[2] else ""))
fails = sum(1 for r in results if r[0] == "FAIL")
print(f"\n{len(results) - fails}/{len(results)} checks passed")
sys.exit(1 if fails else 0)
