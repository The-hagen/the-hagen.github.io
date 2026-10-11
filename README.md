# the-hagen.github.io

Personal site of Mats Hagen. Plain HTML, CSS and JavaScript with no build step,
served by GitHub Pages.

## Where the stock numbers come from

The [stock model](index.html#stock-model) section reads files that the private
`stock_project` pipeline pushes here on the 1st of each month:

| File | What it is |
|---|---|
| `predictions-latest.json` / `.csv` | The newest monthly ranking |
| `data/predictions-YYYY-MM.json` | One ranking per published month |
| `data/history.json` | Index of the months above, newest first |

Nothing in those files is typed by hand. Each row carries only the whitelisted
public fields; `tests/test_data_contract.py` checks that again on this side.

## How a change goes live

```
branch -> pull request -> Evals workflow -> merge to main -> Deploy workflow (Evals again) -> Pages -> live smoke check
```

* **Evals** (`.github/workflows/ci.yml`) decide their own scope. A data-only push
  from the stock pipeline runs the data contract plus one browser pass; any
  other change runs everything: data contract, template-tell checks, HTML
  validation, Playwright + axe in four combinations (desktop/mobile, light/dark),
  Lighthouse budgets, and an advisory design review by Claude when the
  `ANTHROPIC_API_KEY` secret is set.
* **Deploy** (`.github/workflows/deploy.yml`) runs the evals, publishes only
  the files the site serves, then checks that the live site serves the same
  forecast month as `main`.
* **Data freshness** (`.github/workflows/data-freshness.yml`) opens an issue if
  the 5th of a month comes without a new ranking.

One-time setting: **Settings, Pages, Source: GitHub Actions**.

## Running the evals locally

```bash
pip install -r requirements-dev.txt && npm ci
python -m playwright install chromium
python -m pytest -q -m "not browser"          # fast static checks
python .claude/skills/webapp-testing/scripts/with_server.py \
  --server "python -m http.server 8000" --port 8000 -- python -m pytest -q -m browser
```

`EVAL_VIEWPORT=mobile` and `EVAL_SCHEME=dark` switch the browser run.

## Design

`docs/DESIGN.md` has the tokens, layout and rules. They were written with
Anthropic's `frontend-design` skill, and the checks marked there are enforced
by `tests/test_ai_tells.py`. The skills used are vendored in `.claude/skills/`.
