# 2026-04-17 Optimization Plan

## Goal

Turn the current frontend from "feature-rich but partially unsafe for financial interpretation" into a reliable analyst-facing one-page view. The priority is correctness first, then state-handling robustness, then security and maintainability.

## Phase P0

Target window: 1 to 2 working days

Objective: remove the known decision-distorting bugs without changing overall architecture.

### P0 work items

- Fix revenue unit conversion in `js/modules/revenue.js`.
  - Findings addressed: `C1`, `C2`
  - Recommended shape:
    - add explicit helpers in `js/utils.js` such as `formatRevenueFromThousand()`
    - stop sending raw `仟元` values into `formatRevenue()`

- Fix quarterly income revenue conversion in `js/modules/income.js`.
  - Findings addressed: `C3`
  - Recommended shape:
    - render `百萬` with `/ 1e3`
    - or standardize on `億元` and share the same money helper

- Split value semantics from change semantics.
  - Findings addressed: `C5`
  - Recommended shape:
    - keep `valClassChange(delta)` for price moves and growth rates
    - add `valClassLevel()` or a neutral display for EPS and margin rows

- Add visible data timestamp near the header/profile area.
  - Findings addressed: `M2`
  - Data source: latest `quotes.data[*].日期`, optionally plus latest monthsales/income announcement date

- Add warning logs for malformed numeric inputs.
  - Findings addressed: `H4`
  - Recommended shape:
    - keep UI fallback as `—`
    - but emit `console.warn()` with field name and raw value

### P0 verification

- Unit tests for conversion helpers and color semantics.
- Smoke tickers:
  - `2330` for magnitude validation
  - `2317` and `1101` for general regression
  - `2884` for cashflow/ratio edge cases
- Manual check:
  - `2330` monthly revenue should show about `4,151.92 億`
  - `2330` `年季=202504` revenue should show about `1,046,090 百萬` or `10,460.90 億`

## Phase P1

Target window: within 1 week after P0

Objective: make loading states honest and resilient.

### P1 work items

- Refactor strategy CSV loading into an awaited, tri-state model.
  - Findings addressed: `H1`, `H5`
  - Desired states:
    - pending
    - load failed
    - loaded but no ticker rows

- Make strategy snapshot retryable.
  - Findings addressed: `H7`
  - Recommended shape:
    - retry whenever cached snapshot is `null`
    - or keep a timestamped cache with TTL

- Introduce `showNotApplicable(el, reason)`.
  - Findings addressed: `H6`, `M6`
  - Desired behavior:
    - empty but valid dataset shows neutral explanatory text
    - actual exception shows error treatment

- Add retry affordances to failed sections.
  - Findings addressed: `M3`
  - Recommended shape:
    - per-section retry button
    - keep current section layout intact

- Replace the naive CSV parser.
  - Findings addressed: `H2`
  - Recommended shape:
    - minimal compliant parser for quoted fields
    - or a tiny vendored parser if dependency-free size is acceptable

- Align live rule naming with implementation.
  - Findings addressed: `H8`, `H9`
  - Desired outcome:
    - rule labels and tooltips explain "live approximation" vs ScoreCard snapshot
    - `S20` naming reflects monthly logic unless logic is changed

### P1 verification

- Add tests for:
  - strategy CSV failure vs empty vs success
  - snapshot retry path
  - empty ETF datasets such as `0050`
- Manual regression:
  - search immediately after page load
  - disconnect network or rename CSV locally to validate failure messaging

## Phase P2

Target window: 2 to 4 weeks

Objective: reduce long-term support cost and close the remaining security/accessibility gaps.

### P2 work items

- Add `escapeHtml()` and convert plain-text `innerHTML` interpolations to safe output.
  - Findings addressed: `H3`

- Add a CSP policy compatible with current CDN usage, then tighten it once asset hosting is pinned.
  - Findings addressed: `M12`, `L4`

- Introduce request caching keyed by ticker plus dataset.
  - Findings addressed: `M8`

- Add accessibility improvements.
  - Findings addressed: `M5`, `M10`, `M11`
  - Suggested scope:
    - semantic form submission
    - screen-reader labels
    - `aria-busy`
    - non-color directional cues

- Consolidate duplicate sort helpers and unit helpers.
  - Findings addressed: `L2`, `L7`

- Move repeated color literals to CSS custom properties.
  - Findings addressed: `L6`

- Consider export workflows only after correctness and security are stabilized.
  - Findings addressed: `L3`

### P2 verification

- Extend unit tests and add at least one DOM-oriented smoke test suite.
- Accessibility audit target:
  - Lighthouse accessibility score `>= 90`
- Security spot checks:
  - ensure text injection is escaped
  - confirm CSP does not break current CDNs or module loading

## Dependency Order

1. Units and display semantics first, because they directly change what analysts believe.
2. Honest loading states second, because otherwise users cannot trust empty/failure messaging.
3. Security and accessibility third, because they are broad but lower-urgency than incorrect numbers.
4. Caching and refactoring last, once behavior is stable enough to optimize safely.

## Suggested Test Backlog

- `tests/utils.test.js`
  - add money conversion helpers
  - add separate level/change color tests

- `tests/rule_engine.test.js`
  - add documentation tests for `S20` and `S22` semantics

- new module tests
  - revenue renderer amount formatting
  - income renderer amount formatting
  - strategy load state transitions

## Definition of Done

- P0 is done when `2330` renders materially correct revenue magnitudes and level metrics no longer use misleading up/down colors.
- P1 is done when users can distinguish missing data, unsupported data, and actual load failure without guesswork.
- P2 is done when the page has a baseline XSS defense, basic CSP, improved accessibility semantics, and clearer shared helpers for future contributors.
