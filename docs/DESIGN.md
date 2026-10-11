# Design notes

Written before the 2026-10 redesign, following Anthropic's `frontend-design`
skill (plan → check against the brief → build → critique). Keep it current: the
CI "AI-tells" eval enforces the rules marked **(checked)**.

## Brief

- **Subject:** Mats Hagen, credit risk analyst in Oslo, who also runs a model
  that ranks every stock on Oslo Børs once a month and publishes the result here.
- **Audience:** people hiring for credit risk, quant and asset-management roles
  in the Nordics. They skim, then check whether the work is real.
- **Primary job:** show that the stock model is a real, running system (live
  data, honest about what it is), then make contact easy.

## Tokens

| Role | Light | Dark |
|---|---|---|
| Paper (page) | `#F6F7F5` cool off-white | `#11171D` |
| Ink (text, primary buttons) | `#17202A` slate navy | `#E7EBEE` |
| Muted ink | `#4A5562` | `#A7B1BB` |
| Rule | `#D3D8D6` | `#2C353E` |
| Forecast up (data only) | `#2A78D6` | `#3987E5` |
| Forecast down (data only) | `#C93A39` | `#E66767` |
| Neutral dot | `#AEB5B2` | `#4B555E` |
| Focus ring | `#F2B705` | `#F2B705` |

Blue/red are a diverging pair from the `dataviz` skill and are used **only** for
data. Buttons are solid ink, so a button never looks like a data point.

**Type:** Archivo (one variable family). The width axis carries the
personality: the name is set at `wdth 125, wght 800`, headings at `wdth 112`,
body at `wdth 100`. Numbers use tabular figures. No second family.

## Layout

```
 Mats Hagen (wide, heavy)                     Stock model · Work · Contact
 One plain sentence on who and what.
 [ See October's ranking ]  [ Email me ]       <- 52px solid / outlined
 ·· · ·  ·  ···· ·· ···  ···   · ··  · ·       <- every stock this month,
 bottom 10 (red)        rest (grey)   top 10      by forecast; hover = detail
 ───────────────────────────────────────────
 The stock model    (prose column ≤ 68ch, data blocks full width)
   this month: top 10 | bottom 10, then all stocks (search + sector filter)
   history: month picker -> that month's top/bottom, who entered/left
   how a monthly run works (1-6, a real sequence)
   what stops a run · how it is judged · what is not published
 ───────────────────────────────────────────
 Work: dates | role (plain rows)   Education   Skills (plain lists)   Contact
```

Everything is left-aligned. No cards with shadows; sections are separated by
one rule and space.

## Principles

1. **The data is the hero.** The first visual is this month's real forecast
   for every stock, not a gradient, a photo or a counter.
2. **Buttons look like buttons** (checked): at least 48px tall, solid or 2px
   outlined, a visible yellow focus ring, verbs that say what happens.
3. **One motion moment.** The hero dots draw in once on load, and not at all
   with `prefers-reduced-motion`. No scroll-reveal: content is visible
   without JavaScript (checked).
4. **No template tells** (checked): no gradient text, emoji icons, blob
   backgrounds, typing effect, animated counters, ALL-CAPS eyebrows, or
   `→` in button labels.
5. **Honest numbers.** Only what the pipeline publishes. If a data file is
   missing, the page says so and how to read it, rather than showing a demo.

## Review against the brief (what changed after the first plan)

- The first plan opened with a large "144 stocks ranked" number + label. That is
  the default hero treatment; replaced with the dot strip, which shows the
  actual distribution and the picks at both ends.
- The first plan used a monospace face for tickers. That is a common template
  tell; tickers now use Archivo at a narrower width.
- The first plan used numbered markers on every section. Only the run steps are
  a real sequence, so only they are numbered.
