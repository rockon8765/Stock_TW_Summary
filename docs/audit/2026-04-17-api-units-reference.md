# 2026-04-17 API Units Reference

## Purpose

This note records the unit assumptions that can be verified from the current frontend plus live API samples gathered on 2026-04-17. The API responses themselves do not expose explicit unit metadata for every field, so the mapping below is based on sample magnitudes, existing correct code paths, and cross-endpoint consistency.

## Confirmed Unit Map

| Dataset | Field | Sample | Inferred unit | Frontend use | Notes |
| --- | --- | --- | --- | --- | --- |
| `md_cm_fi_monthsales` | `單月合併營收` | `415191699.0` for `2330`, `年月=202603` | `仟元` | `js/modules/revenue.js` | Must convert to base currency before `formatRevenue()` |
| `md_cm_fi_monthsales` | `累計合併營收` | `1134103440.0` for `2330`, `年月=202603` | `仟元` | `js/modules/revenue.js` | Same rule as monthly revenue |
| `md_cm_fi_is_quarterly` | `營業收入淨額` | `1046090421.0` for `2330`, `年季=202504` | `仟元` | `js/modules/income.js`, `js/modules/valuation.js` | `仟元 -> 百萬` uses `/ 1e3`; `仟元 -> 億` uses `/ 1e5` |
| `md_cm_fi_is_quarterly` | `每股稅後盈餘` | `19.5` for `2330`, `年季=202504` | 元/股 | `js/modules/income.js`, `js/modules/profile.js` | No scaling needed |
| `bd_cm_companyprofile` | `實收資本額` | `259325.0` for `2330` | `百萬元` | `js/modules/profile.js:88` | Current `/ 1e2` to `億元` is correct |
| `md_cm_ta_dailyquotes` | `股本` | `259325.0` for `2330`, `日期=2026-04-16` | `百萬元` | profile summary context | Matches company profile magnitude |
| `md_cm_ta_dailyquotes` | `總市值` | `540692.6` for `2330`, `日期=2026-04-16` | `億元` | `js/modules/profile.js` | Already presentation-ready |
| `md_cm_ta_dailyquotes` | `收盤價` | `2085.0` for `2330`, `日期=2026-04-16` | 元 | `js/modules/profile.js`, charting | No scaling needed |
| `md_cm_ta_dailyquotes` | `漲幅` | `0.24` for `2330`, `日期=2026-04-16` | 百分點 | `js/modules/profile.js` | `formatPercent()` is correct as-is |
| `md_cm_ta_dailystatistics` | `Alpha250D` | `0.055199999` for `2330`, `日期=2026-04-16` | decimal ratio | `js/modules/risk_technical.js`, `js/lib/rule_engine.js` | Multiply by `100` for display as `%`; compare raw value in logic |
| `md_cm_ta_dailystatistics` | `年化波動度250D` | `0.312000006` for `2330`, `日期=2026-04-16` | decimal ratio | `js/modules/risk_technical.js` | Multiply by `100` for display |
| `md_cm_ta_dailystatistics` | `乖離率250日` | `53.74000168` for `2330`, `日期=2026-04-16` | 百分點 | `js/modules/risk_technical.js` | Already a percent-like number; do not multiply by `100` again |
| `md_cm_fi_cf_quarterly` | `營業活動現金流量` | `725508787.0` for `2330`, `年季=202504` | `仟元` | `js/modules/cashflow.js` | Current `* 1000` before `formatRevenue()` is correct |
| `md_cm_fi_cf_quarterly` | `自由現金流量` | `360081940.0` for `2330`, `年季=202504` | `仟元` | `js/modules/cashflow.js`, `js/modules/financial_ratios.js` | Same conversion rule as cashflow table |
| `md_cm_fi_cf_quarterly` | `發放現金股利` | `-129663077.0` for `2330`, `年季=202504` | `仟元` | `js/modules/cashflow.js`, `js/modules/financial_ratios.js` | Sign indicates cash outflow; magnitude should usually use `Math.abs()` in display ratios |
| `md_cm_fi_bs_quarterly` | `股本` | `259325245.0` for `2330`, `年季=202504` | `仟元` | future balance-sheet consumers | Note the inconsistency vs profile/dailyquotes `股本` |
| `md_cm_fi_bs_quarterly` | `每股淨值` | `208.99` for `2330`, `年季=202504` | 元/股 | `js/modules/profile.js` | No scaling needed |

## Important Inconsistencies

- `股本` is not unit-consistent across endpoints.
  - `bd_cm_companyprofile.實收資本額 = 259325.0` behaves like `百萬元`
  - `md_cm_ta_dailyquotes.股本 = 259325.0` also behaves like `百萬元`
  - `md_cm_fi_bs_quarterly.股本 = 259325245.0` behaves like `仟元`

- Money fields and percentage fields are mixed across datasets.
  - Quote returns such as `漲幅` are already in percentage-point form.
  - Statistical fields such as `Alpha250D` and `年化波動度250D` are decimal ratios.

## Safe Conversion Rules

### Money

- Use `仟元 -> 元` by multiplying by `1000` before feeding a generic formatter that expects base currency.
- Use `仟元 -> 百萬` by dividing by `1000`.
- Use `仟元 -> 億` by dividing by `100000`.
- Use `百萬元 -> 億` by dividing by `100`.

### Percent-like values

- If the API value is already human-scale like `0.24` for a daily move, format directly as `0.24%`.
- If the API value is a decimal ratio like `0.0552`, multiply by `100` before display.
- Do not reuse price-change color semantics for level metrics unless the metric is actually directional.

## Code Paths That Already Handle Units Correctly

- `js/modules/profile.js:88`
  - `實收資本額 / 1e2 -> 億`

- `js/modules/cashflow.js:60-62`
  - `TTM FCF` and `發放現金股利` multiply by `1000` before formatting

- `js/modules/cashflow.js:90-93`
  - quarterly cashflow rows multiply by `1000` before formatting

- `js/modules/risk_technical.js:59-64`
  - `Alpha250D` and `年化波動度250D` multiply by `100`
  - `乖離率250日` does not

## Code Paths That Need Correction

- `js/modules/revenue.js:27`
  - `單月合併營收` currently passes raw `仟元` into `formatRevenue()`

- `js/modules/revenue.js:30`
  - `累計合併營收` has the same issue

- `js/modules/income.js:39`
  - quarterly revenue uses the wrong divisor for a `百萬` label

## Validation Queries Used

```text
https://data.dottdot.com/api/v1/tables/md_cm_fi_monthsales/query?api_key=guest&ticker=2330&page_size=3
https://data.dottdot.com/api/v1/tables/md_cm_fi_is_quarterly/query?api_key=guest&ticker=2330&page_size=4
https://data.dottdot.com/api/v1/tables/bd_cm_companyprofile/query?api_key=guest&ticker=2330&page_size=1
https://data.dottdot.com/api/v1/tables/md_cm_ta_dailyquotes/query?api_key=guest&ticker=2330&page_size=1
https://data.dottdot.com/api/v1/tables/md_cm_ta_dailystatistics/query?api_key=guest&ticker=2330&page_size=1
https://data.dottdot.com/api/v1/tables/md_cm_fi_cf_quarterly/query?api_key=guest&ticker=2330&page_size=1
https://data.dottdot.com/api/v1/tables/md_cm_fi_bs_quarterly/query?api_key=guest&ticker=2330&page_size=1
```
