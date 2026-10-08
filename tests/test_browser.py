"""Browser evals with Playwright, following the webapp-testing skill:
wait for networkidle, then inspect the rendered DOM.

Accessibility checks encode the accessibility-review skill's WCAG 2.1 AA
quick reference: axe-core for the automatable part (contrast, names, roles,
landmarks), plus explicit checks for target size (2.5.5), keyboard reach
(2.1.1), visible focus (2.4.7) and reflow at 390px.
"""

from __future__ import annotations

import json

import pytest

from conftest import ARTIFACTS, PAGES, ROOT, SCHEME, SITE_URL, VIEWPORT, goto

pytestmark = pytest.mark.browser

PAGE_IDS = [p["path"] for p in PAGES["pages"]]
AXE = ROOT / "node_modules" / "axe-core" / "axe.min.js"


def by_flag(flag):
    return [p["path"] for p in PAGES["pages"] if p.get(flag)]


def shot(page, name):
    ARTIFACTS.mkdir(exist_ok=True)
    slug = name.strip("/").replace("/", "_").replace(".html", "") or "index"
    page.screenshot(path=str(ARTIFACTS / f"{slug}-{VIEWPORT}-{SCHEME}.png"), full_page=True)


@pytest.mark.parametrize("path", PAGE_IDS)
def test_loads_without_errors(page, path):
    goto(page, path)
    if path in by_flag("stock"):
        page.wait_for_selector("html[data-stocks-ready='true']", timeout=10_000)
    shot(page, path)
    assert page.errors == [], "\n".join(page.errors)


@pytest.mark.parametrize("path", by_flag("stock"))
def test_live_ranking_renders(page, path):
    goto(page, path)
    page.wait_for_selector("html[data-stocks-ready='true']", timeout=10_000)
    latest = json.loads((ROOT / "predictions-latest.json").read_text())
    n = latest.get("top_n", 10)

    top = page.locator("#top-table tbody tr")
    assert top.count() == n
    best = min(latest["rankings"], key=lambda r: r["rank"])
    assert best["ticker"].removesuffix(".OL") in top.first.inner_text()

    if path in by_flag("top_only"):
        return
    bottom = page.locator("#bottom-table tbody tr")
    assert bottom.count() == n
    worst = max(latest["rankings"], key=lambda r: r["rank"])
    assert worst["ticker"].removesuffix(".OL") in bottom.first.inner_text()
    # No placeholder dashes left once data is in.
    assert "–" not in page.locator("dl.facts").inner_text()


@pytest.mark.parametrize("path", by_flag("strip"))
def test_strip_has_one_dot_per_stock(page, path):
    goto(page, path)
    page.wait_for_selector("#forecast-strip svg circle.dot")
    latest = json.loads((ROOT / "predictions-latest.json").read_text())
    assert page.locator("#forecast-strip circle.dot").count() == len(latest["rankings"])
    label = page.locator("#forecast-strip svg").get_attribute("aria-label")
    assert label and "tables below" in label


@pytest.mark.parametrize("path", by_flag("strip"))
def test_strip_hover_shows_tooltip(page, path):
    if VIEWPORT == "mobile":
        pytest.skip("hover is a pointer feature; tables cover touch")
    goto(page, path)
    page.wait_for_selector("#forecast-strip circle.hit")
    page.locator("#forecast-strip circle.hit").first.hover(force=True)
    tip = page.locator("#forecast-strip .tooltip")
    assert tip.is_visible() and "Rank 1 of" in tip.inner_text()
    # Rank 1 sits at the right edge: the tooltip must stay inside the chart.
    box, fig = tip.bounding_box(), page.locator("#forecast-strip").bounding_box()
    assert box["x"] >= fig["x"] - 1 and box["x"] + box["width"] <= fig["x"] + fig["width"] + 1


@pytest.mark.parametrize("path", by_flag("all_stocks"))
def test_search_and_sector_filter(page, path):
    goto(page, path)
    page.wait_for_selector("html[data-stocks-ready='true']")
    page.locator("details.all-stocks > summary").click()
    latest = json.loads((ROOT / "predictions-latest.json").read_text())
    rows = page.locator("#all-table tbody tr")
    assert rows.count() == len(latest["rankings"])

    ticker = latest["rankings"][0]["ticker"].removesuffix(".OL")
    page.fill("#stock-search", ticker)
    assert 1 <= rows.count() < len(latest["rankings"])
    assert ticker in rows.first.inner_text()

    page.fill("#stock-search", "")
    sector = latest["rankings"][0]["sector"]
    page.select_option("#stock-sector", sector)
    expected = sum(1 for r in latest["rankings"] if r["sector"] == sector)
    assert rows.count() == expected
    assert f"Showing {expected} of" in page.locator("#stock-count").inner_text()


@pytest.mark.parametrize("path", by_flag("history"))
def test_history_switches_month(page, path):
    goto(page, path)
    page.wait_for_selector("#month-picker button")
    buttons = page.locator("#month-picker button")
    history = json.loads((ROOT / "data" / "history.json").read_text())["months"]
    latest_month = json.loads((ROOT / "predictions-latest.json").read_text())["forecast_month"]
    if latest_month > history[0]["month"]:
        history.insert(0, {"month": latest_month, "file": "predictions-latest.json"})
    assert buttons.count() == len(history)
    if len(history) < 2:
        pytest.skip("only one month published")
    buttons.nth(1).click()
    assert buttons.nth(1).get_attribute("aria-pressed") == "true"
    older = json.loads((ROOT / history[1]["file"]).read_text())
    first = min(older["rankings"], key=lambda r: r["rank"])["ticker"].removesuffix(".OL")
    page.wait_for_function(
        "t => document.querySelector('#history-tables tbody')?.innerText.includes(t)", arg=first)
    # Newest month compares with the month before it.
    buttons.nth(0).click()
    page.wait_for_selector("#history-changes >> text=New in the top")


@pytest.mark.parametrize("path", by_flag("stock"))
def test_missing_data_is_explained_not_broken(browser, path):
    """If the pipeline hasn't published yet, say so instead of erroring."""
    ctx = browser.new_context()
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.route("**/predictions-*.json", lambda r: r.fulfill(status=404, body="not found"))
    pg.route("**/data/history.json", lambda r: r.fulfill(status=404, body="not found"))
    pg.goto(SITE_URL + path)
    pg.wait_for_load_state("networkidle")
    status = pg.locator("[data-stock-status].error").first
    assert status.is_visible() and "could not be loaded" in status.inner_text()
    assert errors == []
    ctx.close()


@pytest.mark.parametrize("path", PAGE_IDS)
def test_buttons_are_visible_targets(page, path):
    """2.5.5 target size, plus contrast of each button's own label."""
    goto(page, path)
    results = page.evaluate("""() => {
      const lum = (rgb) => {
        const [r, g, b] = rgb.match(/[\\d.]+/g).slice(0, 3).map(Number).map(v => {
          v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const bgOf = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const c = getComputedStyle(n).backgroundColor;
          if (c && !c.startsWith('rgba(0, 0, 0, 0)') && c !== 'transparent') return c;
        }
        return 'rgb(255,255,255)';
      };
      return [...document.querySelectorAll('.button')].filter(b => b.offsetParent).map(b => {
        const r = b.getBoundingClientRect(), s = getComputedStyle(b);
        const L1 = lum(s.color), L2 = lum(bgOf(b));
        return { text: b.innerText.trim(), h: r.height, w: r.width,
                 contrast: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05) };
      });
    }""")
    assert results, "no buttons found"
    for b in results:
        assert b["h"] >= 44 and b["w"] >= 44, f"{b['text']!r} is {b['w']:.0f}x{b['h']:.0f}"
        assert b["contrast"] >= 4.5, f"{b['text']!r} contrast {b['contrast']:.2f}"


@pytest.mark.parametrize("path", PAGE_IDS)
def test_keyboard_reaches_main_actions_with_visible_focus(page, path):
    goto(page, path)
    seen = []
    for _ in range(12):
        page.keyboard.press("Tab")
        info = page.evaluate("""() => {
          const el = document.activeElement, s = getComputedStyle(el);
          return { text: (el.innerText || '').trim().slice(0, 40), cls: el.className,
                   outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 };
        }""")
        seen.append(info)
    assert seen[0]["text"] == "Skip to content", "first Tab should reach the skip link"
    buttons = [s for s in seen if "button" in str(s["cls"])]
    assert buttons, "no button reachable in the first 12 Tab presses"
    assert all(s["outline"] for s in seen if s["text"]), "an element got focus with no visible ring"


@pytest.mark.parametrize("path", PAGE_IDS)
def test_no_horizontal_scroll(page, path):
    goto(page, path)
    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    assert overflow <= 1, f"page is {overflow}px wider than the viewport"


@pytest.mark.parametrize("path", PAGE_IDS)
def test_axe_wcag_aa(page, path):
    if not AXE.exists():
        pytest.skip("run `npm ci` to install axe-core")
    goto(page, path)
    if path in by_flag("stock"):
        page.wait_for_selector("html[data-stocks-ready='true']")
    page.add_script_tag(path=str(AXE))
    result = page.evaluate("""async () => await axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })""")
    bad = [v for v in result["violations"] if v["impact"] in ("serious", "critical")]
    report = "\n".join(f"{v['id']} ({v['impact']}): {v['help']} x{len(v['nodes'])}" for v in bad)
    assert not bad, report


@pytest.mark.parametrize("path", PAGE_IDS)
def test_links_resolve(page, path):
    goto(page, path)
    hrefs = page.evaluate("[...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href'))")
    for href in hrefs:
        if href.startswith("#"):
            assert page.locator(f"[id='{href[1:]}']").count() == 1, f"anchor {href} has no target"
        elif not href.startswith(("http", "mailto:")):
            target = href.split("#")[0]
            assert (ROOT / target).exists(), f"{href} points at a missing file"
            if "#" in href:
                html = (ROOT / target).read_text()
                assert f'id="{href.split("#")[1]}"' in html, f"{href}: anchor missing in {target}"


@pytest.mark.parametrize("old,new", PAGES["redirects"].items())
def test_old_urls_redirect(page, old, new):
    page.goto(SITE_URL + old)
    page.wait_for_url(f"**{new}")


@pytest.mark.reduced_motion
@pytest.mark.parametrize("path", by_flag("strip"))
def test_reduced_motion_disables_entrance(page, path):
    goto(page, path)
    page.wait_for_selector("#forecast-strip svg")
    assert "animate" not in (page.locator("#forecast-strip").get_attribute("class") or "")
