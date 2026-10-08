"""Static checks for the template tells docs/DESIGN.md rules out.

These come from Anthropic's frontend-design skill (.claude/skills/frontend-design)
and from what the previous version of this site had. They are cheap, so they
run on every push; the judgement calls go to the optional design judge.
"""

from __future__ import annotations

import re

import pytest

from conftest import ROOT, html_pages

CSS = (ROOT / "assets" / "site.css").read_text()
JS = "\n".join(p.read_text() for p in (ROOT / "assets").glob("*.js"))
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")


@pytest.mark.parametrize("path", html_pages(), ids=lambda p: p.name)
def test_no_emoji_icons(path):
    found = EMOJI.findall(path.read_text())
    assert not found, f"emoji used as decoration: {found}"


@pytest.mark.parametrize("path", html_pages(), ids=lambda p: p.name)
def test_buttons_say_what_happens(path):
    html = path.read_text()
    for label in re.findall(r'class="button[^"]*"[^>]*>(.*?)</(?:a|button|summary)>', html, re.S):
        text = re.sub(r"<[^>]+>", "", label).strip()
        assert "→" not in text and "&rarr;" not in label, f"arrow appended to button: {text!r}"
        assert text.lower() not in {"submit", "click here", "learn more", "view my work"}, f"vague label: {text!r}"


def test_no_gradient_text_or_blobs():
    assert "background-clip: text" not in CSS and "-webkit-text-fill-color" not in CSS
    assert "blob" not in CSS
    assert "linear-gradient" not in CSS and "radial-gradient" not in CSS


def test_no_all_caps_labels():
    assert "text-transform: uppercase" not in CSS


def test_no_typing_effect_or_counters():
    assert not re.search(r"typed|typing|setInterval\(", JS), "typing animation or counter is back"


def test_content_visible_without_scroll_reveal():
    """The old site hid sections until an observer fired; a full-page
    screenshot showed them empty. Nothing may start invisible."""
    assert not re.search(r"opacity:\s*0\s*;", CSS.split("@keyframes")[0])


def test_one_typeface():
    families = set(re.findall(r'family=([A-Za-z+]+)', "".join(p.read_text() for p in html_pages())))
    assert families <= {"Archivo"}, f"extra font families loaded: {families}"


def test_buttons_are_big_in_css():
    """Principle 2 in docs/DESIGN.md: buttons at least 48px, small ones 44px."""
    block = re.search(r"\.button \{(.*?)\}", CSS, re.S).group(1)
    assert int(re.search(r"min-height:\s*(\d+)px", block).group(1)) >= 48
    small = re.search(r"\.button\.small \{(.*?)\}", CSS, re.S).group(1)
    assert int(re.search(r"min-height:\s*(\d+)px", small).group(1)) >= 44
    assert re.search(r"border:\s*2px solid", block), "buttons need a visible 2px edge"


def test_focus_ring_defined():
    assert re.search(r":focus-visible\s*\{[^}]*outline:\s*3px", CSS)


def test_reduced_motion_respected():
    assert "prefers-reduced-motion" in CSS and "prefers-reduced-motion" in JS
