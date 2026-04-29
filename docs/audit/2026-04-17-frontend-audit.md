# 2026-04-17 Frontend Audit

## Scope

- Target: `index.html`, `css/style.css`, `js/`, strategy snapshot integration, existing test coverage.
- Out of scope: Python ScoreCard pipeline, deployment config, backend/API implementation.
- Audit basis: repository state in `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov` on 2026-04-17.

## Method

1. Read `docs/plans/streamed-gliding-panda.md` and verify each cited frontend issue against current source.
2. Inspect live API samples with `api_key=guest` for `2330`, plus control cases `0050` and `9999`.
3. Cross-check current unit tests to understand existing coverage and blind spots.

Notes:

- `docs/plans/streamed-gliding-panda.md` refers to `docs/plans/gentle-sniffing-pike.md`, but that file is not present in this worktree, so this report uses the current codebase and live API results as the source of truth.
- The worktree is dirty before this audit work. Notable pre-existing items: `D .env.example`, untracked `docs/plans/streamed-gliding-panda.md`, and untracked `.playwright-cli/`.

## Executive Summary

Current frontend quality is mixed: several earlier defects are fixed, but the page still contains three material amount-scaling bugs and one misleading color-semantics bug in the financial tables. Those defects are large enough to misstate core business figures for `2330` by 10x to 1000x and make the current page unsuitable as a decision-support view until corrected.

The most important correctness issue is unit mismatch. Live API responses show `md_cm_fi_monthsales` and `md_cm_fi_is_quarterly` monetary fields are returned in `仟元`, while current UI formatters in `js/modules/revenue.js` and `js/modules/income.js` render them as if they were already base currency. `js/modules/cashflow.js` and `js/modules/risk_technical.js` are useful counterexamples: both already perform the necessary conversion correctly.

## API Evidence

### `2330` month sales

- Query on 2026-04-17: `md_cm_fi_monthsales`, `ticker=2330`, `page_size=3`
- Latest row: `年月=202603`, `公告日=2026-04-10`
- Raw values:
  - `單月合併營收 = 415191699.0`
  - `累計合併營收 = 1134103440.0`
- Interpretation:
  - If unit is `仟元`, then `415191699.0` means `415,191,699 仟元 = 415,191,699,000 元 = 4,151.92 億`
  - Current code path `formatRevenue(415191699)` renders `4.15 億`
  - Error magnitude: `1/1000`

### `2330` quarterly income

- Query on 2026-04-17: `md_cm_fi_is_quarterly`, `ticker=2330`, `page_size=4`
- Latest published quarter row: `年季=202504` (2025Q4), `公告日期=2026-02-26`
- Raw values:
  - `營業收入淨額 = 1046090421.0`
  - `每股稅後盈餘 = 19.5`
- Interpretation:
  - If unit is `仟元`, then revenue should be shown as `1,046,090 百萬` or `10,460.90 億`
  - Current code path `(r.rev / 1e4).toFixed(0) + ' 百萬'` renders `104,609 百萬`
  - Error magnitude: `1/10`

### `2330` company profile and quote

- `bd_cm_companyprofile` on 2026-04-17 returns `實收資本額 = 259325.0`
- `md_cm_ta_dailyquotes` latest row dated `2026-04-16` returns:
  - `收盤價 = 2085.0`
  - `漲幅 = 0.24`
  - `總市值 = 540692.6`
  - `股本 = 259325.0`
- Current `js/modules/profile.js:88` uses `capital / 1e2`, which correctly renders `2,593.25 億`

### `2330` daily statistics

- `md_cm_ta_dailystatistics` latest row dated `2026-04-16` returns:
  - `Alpha250D = 0.055199999`
  - `年化波動度250D = 0.312000006`
  - `乖離率250日 = 53.74000168`
- Current `js/modules/risk_technical.js:59-64` multiplies Alpha/volatility by `100` and leaves `乖離率250日` as-is, which matches observed API semantics.

### Control cases

- `md_cm_fi_is_quarterly?ticker=0050&page_size=3` returns `status=success` with `data=[]`.
- `bd_cm_companyprofile?ticker=9999&page_size=1` returns `status=success` with `data=[]`.

These two responses confirm the current UI problem is not only fetch failure; the API also legitimately returns success with empty datasets, so "not applicable / no data" needs a separate state from "load failed".

## Findings

### Critical

- `C1` Monthly revenue is rendered at `1/1000` of the real value.
  - Location: `js/modules/revenue.js:27`, `js/utils.js:11-17`
  - Why: `formatRevenue()` assumes the input is already base currency, but `md_cm_fi_monthsales` returns `仟元`.
  - Example: `2026-03` monthly revenue for `2330` should be `4,151.92 億`, but current rendering path produces about `4.15 億`.

- `C2` Cumulative revenue has the same `1/1000` scaling defect.
  - Location: `js/modules/revenue.js:30`, `js/utils.js:11-17`
  - Why: same unit mismatch as `C1`.
  - Example: `累計合併營收 = 1,134,103,440 仟元` should be `11,341.03 億`, but current path renders about `11.34 億`.

- `C3` Quarterly revenue is rendered at `1/10` of the real value.
  - Location: `js/modules/income.js:39`
  - Why: the code divides `仟元` by `1e4` and labels the result as `百萬`; the correct divisor for `仟元 -> 百萬` is `1e3`.
  - Example: `2025Q4` (`年季=202504`) revenue for `2330` should be `1,046,090 百萬`, but current UI would render `104,609 百萬`.

- `C5` `valClass()` is applied to level metrics whose color semantics are not "up/down change".
  - Location: `js/modules/income.js:40-43`, `js/utils.js:26-29`
  - Why: positive gross margin, operating margin, net margin, and EPS are currently painted with the same "up" class used for price moves. In the Taiwan UI palette this means red for a positive number and green for a negative number, which is visually misleading for level metrics.
  - User impact: positive EPS appears as a warning-like red state; negative EPS appears green.

### High

- `H1` Strategy CSV load failures are swallowed silently.
  - Location: `js/modules/strategy.js:56-64`
  - Risk: network failure and "ticker has no rows" collapse into the same UI.

- `H2` CSV parsing does not support quoted commas.
  - Location: `js/modules/strategy.js:14-20`
  - Risk: strategy names containing commas will shift columns and corrupt the table.

- `H3` Many modules write unescaped API/CSV text into `innerHTML`.
  - Representative locations: `js/modules/profile.js:78-115`, `js/modules/insider_governance.js:44-86`, `js/modules/strategy.js:79-107`
  - Risk: any polluted upstream string becomes an XSS vector because there is no `escapeHtml()` layer.

- `H4` Formatter fallbacks hide abnormal data without logging.
  - Location: `js/utils.js:2-29`
  - Risk: `null`, malformed numeric strings, and schema drift collapse into `—`, leaving no console or telemetry trail for debugging.

- `H5` Strategy performance data has a startup race.
  - Location: `js/main.js:424`, `js/modules/strategy.js:114-118`
  - Risk: the first user search can happen before `loadStrategyData()` finishes, causing a false "策略資料載入失敗" state.

- `H6` "Not applicable" and "load failed" share the same presentation path.
  - Location: `js/main.js:153-391`, `js/utils.js:116-118`
  - Evidence: `0050` quarterly income returns `success + []`, but modules still fall back to failure messaging.

- `H7` Strategy snapshot fetch is single-shot and non-recoverable.
  - Location: `js/main.js:131-147`, `js/api.js:210-218`
  - Risk: if the first fetch returns `null`, `strategySnapshotLoadedOnce` is still set to `true`, so all later searches permanently skip retry.

- `H8` Rule `S22` intentionally diverges from the Python pipeline.
  - Location: `js/lib/rule_engine.js:151-186`
  - Why: the JS live path approximates "與大盤比年報酬率" with `Alpha250D`.
  - Risk: frontend alert chips and the Python ScoreCard can disagree for the same ticker/date.

- `H9` Rule `S20` name and implementation do not match.
  - Location: `js/lib/rule_engine.js:135-149`, `js/lib/rule_engine.js:221-223`
  - Why: label says "單季營收連兩季衰退", implementation checks two months of monthly YoY declines.

### Medium

- `M1` `fiveYearsAgo()` and `today()` use `toISOString()`, so the local date range can drift by one day in Taipei between `00:00` and `08:00`.
  - Location: `js/api.js:18-26`

- `M2` The page does not display an as-of timestamp for the rendered dataset.
  - Location: `index.html:225-228`

- `M3` Failed sections do not offer a retry affordance.
  - Location: `js/main.js:153-391`

- `M4` K-line range button visual state is not reset on ticker switch.
  - Location: `js/charts/kline.js:78`, `js/charts/kline.js:137-145`

- `M5` Up/down cues rely almost entirely on red/green color.
  - Location: `css/style.css` classes such as `.val-up` and `.val-down`

- `M6` There is no shared helper for "not applicable" datasets.
  - Location: no equivalent of `showNotApplicable()` exists in `js/utils.js`

- `M7` Config intent is inconsistent around the public API key.
  - Location: `js/api.js:2`, `.env`, deleted `.env.example`
  - Evidence:
    - `js/api.js` hardcodes `guest`
    - `.env` also sets `CM_API_KEY=guest`
    - `git status` shows `D .env.example`

- `M8` There is no client-side caching layer for repeated ticker switches.
  - Location: `js/api.js`, `js/main.js`

- `M9` `getLatestQuote()` compares ISO date strings with `>`.
  - Location: `js/modules/profile.js:3-9`
  - Current behavior is safe only while the API keeps `YYYY-MM-DD`.

- `M10` Skeleton loading UI has no accessibility attributes like `aria-busy` or `role="status"`.
  - Location: `index.html:61-64` and similar skeleton blocks

- `M11` Search input has no explicit `<label>` and is not wrapped in a semantic `<form>`.
  - Location: `index.html:34-45`, `js/main.js:418-421`

- `M12` There is no Content Security Policy.
  - Location: `index.html:1-27`

### Low

- `L1` Skeleton markup is heavily duplicated in `js/main.js`.
- `L2` There is no schema or units reference for mixed Chinese field keys across modules.
- `L3` No export workflow exists for PDF / Excel / screenshot handoff.
- `L4` Tailwind and Lightweight Charts are loaded from CDNs without pinning plus SRI.
  - Location: `index.html:7`, `index.html:25`
- `L5` Test coverage exists, but mostly for happy-path helpers and rule outputs.
  - Present files: `tests/utils.test.js`, `tests/rule_engine.test.js`, `tests/dividend_aggregator.test.js`, `tests/strategy_snapshot_contract.test.js`, `tests/config.test.js`, `tests/strategy-config.test.js`
- `L6` `css/style.css` still relies on hardcoded colors rather than CSS custom properties.
- `L7` Quarter/year sorting helpers are repeated across modules.
  - Representative locations: `js/modules/financial_ratios.js:4-8`, `js/modules/cashflow.js:34-36`, `js/modules/profile.js:27-29`, `js/modules/long_term_trend.js:64-68`
- `L8` `renderStrategyScores()` rewrites `onclick` on each render.
  - Location: `js/modules/strategy_scores.js:47-62`
- `L9` Several modules rely on implicit `undefined` handling from `Number()` and formatter guards instead of explicit null checks.

## Verified Non-Findings

- `js/modules/profile.js:88` fixes capital display correctly by converting `實收資本額` from `百萬元` to `億元`.
- `js/charts/kline.js:10-18` correctly disconnects `ResizeObserver` and removes the previous chart before re-render.
- `js/modules/risk_technical.js:54` guards `latest` with `|| {}` and safely converts decimal ratio fields.
- `js/modules/cashflow.js:60-62`, `js/modules/cashflow.js:90-93` correctly multiply `仟元` fields by `1000` before passing them to `formatRevenue()`.
- `js/modules/rule_alerts.js:39` now renders rule chips as `code + name`, which fixes the prior label loss problem mentioned in the plan.
- `scorecard_web.json` is present and covered by `tests/strategy_snapshot_contract.test.js:10-40`.

## Test Coverage Snapshot

- Existing tests are useful for helpers and contract validation, but there is no coverage for the currently broken unit conversions in `revenue.js` and `income.js`.
- Missing test families:
  - revenue formatter behavior for `仟元 -> 億/百萬`
  - margin/EPS color semantics separate from price movement semantics
  - strategy load state transitions: pending, failed, empty, success
  - "success + []" datasets for ETFs and unsupported categories

## Recommended Repair Order

1. Fix `C1`, `C2`, `C3`, and `C5` first.
2. Split "load failed" from "not applicable" and repair strategy-load state handling (`H1`, `H5`, `H6`, `H7`).
3. Add `escapeHtml()` plus a minimal CSP (`H3`, `M12`).
4. Expand tests around units, semantics, and empty-state handling.
