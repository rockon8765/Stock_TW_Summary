# 2026-05-06 Verification Report

狀態：工具第一版已建立。這份檔案是固定報告入口，實際逐檔輸出會由 `compare_tier_a.mjs` / `compare_tier_b.mjs` 產生在同一目錄。

## Implemented

- dottdot 15 張 table 契約與 sample ticker 清單。
- TWSE `STOCK_DAY` / `BWIBBU_d` fetcher 與 normalization。
- Tier A quote / BWIBBU 自動比對 CSV + Markdown output。
- Tier B frontend transform rebuild CSV + Markdown output。
- MOPS / TDCC 人工抽檢 CSV template generator。
- Regression tests: `tests/data_verify.test.js`。

## Pending Manual Inputs

- MOPS 公司基本資料、月營收、季財報、現金流、股利、內部人欄位。
- TDCC 集保戶股權分散表。
- Tier C 15 項商業定義覆核。

## Sign-off Rule

所有 Tier A `needs_explanation = yes` 的列都必須補上 `classification` 與 `reason` 後才能視為通過。
