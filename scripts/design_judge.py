"""Model-graded design review of the rendered site.

Sends the full-page screenshots the browser evals saved (eval-artifacts/*.png)
to Claude, with Anthropic's frontend-design and design-critique skills as the
rubric, and writes a critique to the GitHub job summary.

Advisory by default: the deterministic evals gate the merge; this one catches
what a regex can't ("does this still read as a template?"). Pass --enforce to
fail the job when the verdict is "revise".

Needs ANTHROPIC_API_KEY. In CI it only runs when that secret is set.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from pathlib import Path

import anthropic

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ROOT / ".claude" / "skills"
MODEL = "claude-opus-5-5"

SCHEMA = {
    "type": "object",
    "properties": {
        "scores": {
            "type": "object",
            "description": "1 (poor) to 5 (excellent)",
            "properties": {
                "distinct_from_templates": {"type": "integer"},
                "button_visibility": {"type": "integer"},
                "hierarchy_and_reading_order": {"type": "integer"},
                "stock_section_clarity": {"type": "integer"},
                "accessibility_at_a_glance": {"type": "integer"},
            },
            "required": [
                "distinct_from_templates", "button_visibility", "hierarchy_and_reading_order",
                "stock_section_clarity", "accessibility_at_a_glance",
            ],
            "additionalProperties": False,
        },
        "template_tells_found": {"type": "array", "items": {"type": "string"}},
        "priority_fixes": {"type": "array", "items": {"type": "string"}},
        "critique_markdown": {"type": "string"},
        "verdict": {"type": "string", "enum": ["ship", "revise"]},
    },
    "required": ["scores", "template_tells_found", "priority_fixes", "critique_markdown", "verdict"],
    "additionalProperties": False,
}


def image_block(path: Path) -> dict:
    data = base64.standard_b64encode(path.read_bytes()).decode()
    return {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": data}}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--shots", default=str(ROOT / "eval-artifacts"))
    parser.add_argument("--enforce", action="store_true", help="exit 1 on a 'revise' verdict")
    args = parser.parse_args()

    shots = sorted(Path(args.shots).glob("*.png"))
    if not shots:
        print("no screenshots found; run the browser evals first", file=sys.stderr)
        return 2

    rubric = "\n\n".join(
        (SKILLS / name / "SKILL.md").read_text() for name in ("frontend-design", "design-critique")
    )
    brief = (ROOT / "docs" / "DESIGN.md").read_text()

    content: list[dict] = []
    for shot in shots:
        content.append({"type": "text", "text": f"Screenshot: {shot.name}"})
        content.append(image_block(shot))
    content.append({
        "type": "text",
        "text": (
            "Review this personal site against the brief and rubric in the system prompt. "
            "Judge the rendered result in the screenshots, not the intent. Score each "
            "dimension 1-5, list any template tells you can actually see, and give the "
            "critique in the design-critique output format. Verdict 'ship' only if no "
            "score is below 3 and no template tell is clearly present."
        ),
    })

    client = anthropic.Anthropic()
    try:
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "high", "format": {"type": "json_schema", "schema": SCHEMA}},
            system=f"You are reviewing a website design.\n\n# Brief\n{brief}\n\n# Rubric\n{rubric}",
            messages=[{"role": "user", "content": content}],
        )
    except anthropic.RateLimitError:
        print("rate limited; skipping the design review this run", file=sys.stderr)
        return 0
    except anthropic.APIStatusError as exc:
        if exc.status_code >= 500:
            print(f"API error {exc.status_code}; skipping the design review this run", file=sys.stderr)
            return 0
        raise
    except anthropic.APIConnectionError:
        print("could not reach the API; skipping the design review this run", file=sys.stderr)
        return 0

    if response.stop_reason == "refusal":
        print("the review was declined; nothing to report", file=sys.stderr)
        return 0
    text = next(b.text for b in response.content if b.type == "text")
    review = json.loads(text)

    lines = ["## Design review (Claude, advisory)", ""]
    lines += [f"**Verdict:** {review['verdict']}", "", "| Dimension | Score |", "|---|---|"]
    lines += [f"| {k.replace('_', ' ')} | {v}/5 |" for k, v in review["scores"].items()]
    if review["template_tells_found"]:
        lines += ["", "**Template tells seen:**"] + [f"- {t}" for t in review["template_tells_found"]]
    if review["priority_fixes"]:
        lines += ["", "**Priority fixes:**"] + [f"{i}. {f}" for i, f in enumerate(review["priority_fixes"], 1)]
    lines += ["", "<details><summary>Full critique</summary>", "", review["critique_markdown"], "", "</details>"]
    report = "\n".join(lines) + "\n"

    print(report)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as fh:
            fh.write(report)
    (ROOT / "eval-artifacts" / "design-review.json").write_text(json.dumps(review, indent=2))

    return 1 if args.enforce and review["verdict"] == "revise" else 0


if __name__ == "__main__":
    sys.exit(main())
