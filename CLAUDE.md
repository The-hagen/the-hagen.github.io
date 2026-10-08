# Notes for Claude

- Static site, no build step. Edit `index.html`, `assets/*`; never hand-edit
  `predictions-latest.*` or `data/*`: the stock_project pipeline owns them.
- Before changing the look, read `docs/DESIGN.md` and
  `.claude/skills/frontend-design/SKILL.md`. Keep `docs/DESIGN.md` in sync.
- Before pushing, run the static evals and the browser evals (see README).
  Use `.claude/skills/webapp-testing` for any new browser check.
- New pages go in `tests/pages.json` so every eval covers them.
