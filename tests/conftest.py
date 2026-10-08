"""Shared fixtures for the site evals.

The browser tests expect a server on SITE_URL (default http://localhost:8000).
CI starts one with the webapp-testing skill's helper:

    python .claude/skills/webapp-testing/scripts/with_server.py \
        --server "python -m http.server 8000" --port 8000 -- pytest tests

Static tests (data contract, AI tells, buttons in CSS) need no server.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
PAGES = json.loads((ROOT / "tests" / "pages.json").read_text())
SITE_URL = os.environ.get("SITE_URL", "http://localhost:8000").rstrip("/")
ARTIFACTS = ROOT / "eval-artifacts"

# Viewport and colour scheme come from the CI matrix, so one job checks one
# combination and the matrix covers them all.
VIEWPORTS = {"desktop": {"width": 1280, "height": 900}, "mobile": {"width": 390, "height": 844}}
VIEWPORT = os.environ.get("EVAL_VIEWPORT", "desktop")
SCHEME = os.environ.get("EVAL_SCHEME", "light")


def html_pages() -> list[Path]:
    return sorted(p for p in ROOT.glob("*.html"))


@pytest.fixture(scope="session")
def browser():
    sync_api = pytest.importorskip("playwright.sync_api")
    with sync_api.sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        yield b
        b.close()


@pytest.fixture()
def page(browser, request):
    context = browser.new_context(
        viewport=VIEWPORTS[VIEWPORT],
        color_scheme=SCHEME,
        reduced_motion="reduce" if request.node.get_closest_marker("reduced_motion") else "no-preference",
    )
    pg = context.new_page()
    errors: list[str] = []
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    pg.errors = errors  # type: ignore[attr-defined]
    yield pg
    context.close()


def goto(page, path: str):
    page.goto(SITE_URL + path)
    page.wait_for_load_state("networkidle")
    return page
