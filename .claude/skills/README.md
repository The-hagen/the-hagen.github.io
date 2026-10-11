# Vendored skills

Official Anthropic skills used to build and check this site. Copied unchanged
(Apache-2.0, licence files alongside) so CI and future Claude Code sessions use
the same versions.

| Skill | Source | Commit | Used for |
|---|---|---|---|
| `frontend-design` | anthropics/claude-plugins-official `plugins/frontend-design` | 315c4e4 | Design plan in `docs/DESIGN.md`; rubric for the design judge |
| `webapp-testing` | anthropics/skills `skills/webapp-testing` | 683bc88 | `scripts/with_server.py` runs the server for the Playwright evals |
| `accessibility-review` | anthropics/knowledge-work-plugins `design` | ae1513e | WCAG 2.1 AA checklist the browser evals encode |
| `design-critique` | anthropics/knowledge-work-plugins `design` | ae1513e | Framework for the design judge's report |

`dataviz` (bundled with Claude Code) set the chart palette; its validator
results are recorded in `docs/DESIGN.md`.

To update one, copy the new version over the folder and record the commit.
