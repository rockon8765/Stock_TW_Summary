# Data Correctness Verification

這個目錄落實 `docs/plans/2026-05-06-data-correctness-verification.md` 的第一版驗證工具。目標是把 StockOnePage 前端顯示值拆成可重跑的資料比對流程：先抓 dottdot raw，再抓官方公開資料，最後輸出可分類的 mismatch report。

## Scripts

```bash
npm run data:fetch:dottdot -- --ticker 2330 --datasets quotes,sales,income
npm run data:fetch:twse -- --ticker 2330 --date 2026-05-05
npm run data:compare:tier-a -- --ticker 2330
npm run data:compare:tier-b -- --ticker 2330
npm run data:manual:mops -- --ticker 2330,2317
npm run data:manual:tdcc -- --ticker 2330,2317
```

`DOTTDOT_API_KEY` 可用環境變數提供；未提供時預設使用 `guest`，與現有前端 `js/api.js` 一致。

## Scope In This Pass

- `lib/contract.mjs` 固定 15 張 dottdot table、6 檔 sample ticker、Tier C 15 項人工確認清單，以及 mismatch 分類。
- `fetch_dottdot.mjs` 抓取 sample ticker 的 dottdot raw rows，輸出 JSON snapshot。
- `fetch_twse.mjs` 抓 TWSE 個股月行情 `rwd/zh/afterTrading/STOCK_DAY` 與 OpenAPI `BWIBBU_d`。
- `compare_tier_a.mjs` 目前先自動比對 TWSE 可直接取到的報價與 BWIBBU 欄位：OHLC、漲跌、成交量股數、PE4、PB、殖利率。
- `compare_tier_b.mjs` 先重建 frontend transform：3M YoY、12M TTM YoY、EPS TTM YoY、100~400 張反推、年度現金股利與年度發放率。
- `fetch_mops.mjs` / `fetch_tdcc.mjs` 先產生人工抽檢 CSV 模板；MOPS form post 與 TDCC 互動查詢後續可再逐步自動化。

## Report Rules

Tier A report 中 `needs_explanation = yes` 的列不能直接驗收，必須補上計劃書定義的分類：

- `upstream_error`
- `endpoint_semantics`
- `date_mismatch`
- `frontend_transform_error`

目前腳本保留空白 `classification` / `reason` 欄位，讓人工覆核後填入，確保「未解釋 mismatch 為 0」可以被檢查。

## Current Limitations

- MOPS、TDCC 尚未全自動解析，第一版依計劃先走人工模板。
- Tier A 自動比對先覆蓋 TWSE quote / BWIBBU；法人 T86、MOPS 財報、TDCC 股權分散會在下一輪擴充。
- Tier B 目前是「用 dottdot raw 重建前端 transform」，還不是完整公開源 reconciliation。
