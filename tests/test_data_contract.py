"""The published stock files: shape, consistency, and the public boundary.

stock_project's monthly run pushes these files straight to main. Deploy waits
on this suite, so a malformed or over-sharing file blocks the deploy and the
live site keeps the previous month's version.
"""

from __future__ import annotations

import json

import pytest

from conftest import ROOT

# Mirrors PUBLIC_FIELDS in stock_project/quant/reports.py. Anything else in a
# row is a leak, not a new feature: change both sides together.
PUBLIC_FIELDS = {"rank", "ticker", "name", "sector", "pred_return_pct", "signal", "is_pick", "prev_rank"}
FORBIDDEN = ("importance", "mdi", "permutation", "shap", "contribution", "feature")
TOP_LEVEL = {"run_id", "generated_at", "forecast_month", "universe_size", "top_n", "market_regime", "rankings"}


def prediction_files():
    files = sorted((ROOT / "data").glob("predictions-*.json"))
    latest = ROOT / "predictions-latest.json"
    return ([latest] if latest.exists() else []) + files


@pytest.mark.parametrize("path", prediction_files(), ids=lambda p: p.name)
def test_ranking_file_shape(path):
    payload = json.loads(path.read_text())
    assert set(payload) <= TOP_LEVEL, f"unexpected top-level keys: {set(payload) - TOP_LEVEL}"
    assert {"forecast_month", "generated_at", "rankings"} <= set(payload)
    rows = payload["rankings"]
    assert rows, "empty ranking"
    assert len(rows) == payload.get("universe_size", len(rows))

    ranks = sorted(r["rank"] for r in rows)
    assert ranks == list(range(1, len(rows) + 1)), "ranks must be 1..n with no gaps"

    by_rank = sorted(rows, key=lambda r: r["rank"])
    values = [r["pred_return_pct"] for r in by_rank]
    assert values == sorted(values, reverse=True), "rank 1 must have the highest forecast"

    top_n = payload.get("top_n", 10)
    picks = [r["rank"] for r in rows if r.get("is_pick")]
    assert picks == list(range(1, top_n + 1)) or sorted(picks) == list(range(1, top_n + 1))

    tickers = [r["ticker"] for r in rows]
    assert len(set(tickers)) == len(tickers), "duplicate tickers"


@pytest.mark.parametrize("path", prediction_files(), ids=lambda p: p.name)
def test_public_boundary(path):
    """Same rule the pipeline enforces, checked again where the file lands."""
    payload = json.loads(path.read_text())
    for row in payload["rankings"]:
        extra = set(row) - PUBLIC_FIELDS
        assert not extra, f"{row.get('ticker')}: unexpected fields {sorted(extra)}"
    text = json.dumps(payload).lower()
    for token in FORBIDDEN:
        assert f'"{token}' not in text, f"'{token}' appears as a key in {path.name}"


def test_history_index_matches_files():
    index_path = ROOT / "data" / "history.json"
    if not index_path.exists():
        pytest.skip("no history index published yet")
    months = json.loads(index_path.read_text())["months"]
    assert months, "history index is empty"
    listed = [m["month"] for m in months]
    assert listed == sorted(listed, reverse=True), "history must be newest first"
    for m in months:
        f = ROOT / m["file"]
        assert f.exists(), f"history lists {m['file']} but the file is missing"
        assert json.loads(f.read_text())["forecast_month"] == m["month"]


def test_latest_is_newest_history_month():
    latest = ROOT / "predictions-latest.json"
    index_path = ROOT / "data" / "history.json"
    if not (latest.exists() and index_path.exists()):
        pytest.skip("needs both the latest file and the history index")
    newest = json.loads(index_path.read_text())["months"][0]["month"]
    assert json.loads(latest.read_text())["forecast_month"] == newest
