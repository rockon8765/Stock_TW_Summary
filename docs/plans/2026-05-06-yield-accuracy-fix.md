# 殖利率資料正確性處理計畫（2026-05-06）

> **分支**：`feature/layout-claude`
> **Worktree**：`/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov`
> **範圍**：
> 1. **修正驗證腳本**：`compare_tier_a.mjs` 殖利率比對缺日期保護、比錯欄位
> 2. **UI 揭露**：股票摘要與股利表分別加備註，說明算法與資料日期可能造成的短暫差異
> **不在範圍**：A 案 PE 標籤誤導（另案）、Tier C 商業定義 15 項、MOPS / TDCC 自動化擴充。

---

## 一、需求背景

### 1.1 自動驗證初次結果

A2 自動驗證（`compare_tier_a.mjs`）跑完，4 檔可比樣本中 2 檔殖利率不一致：

| Ticker | 前端顯示算法（dottdot 5/6 報價）| TWSE BWIBBU_d（5/5）| 初判 |
|--------|---------|------|------|
| 2330 台積電 | 22.00 / 2,250 = 0.98% | 0.98% | ✅ |
| 2412 中華電 | 5.20 / 136 = 3.82% | 3.82% | ✅ |
| 2317 鴻海 | **7.20 / 252 = 2.86%** | **3.01%** | ❌ |
| 2882 國泰金 | **3.50 / 78.7 = 4.45%** | **4.53%** | ❌ |

### 1.2 經人工反推後發現「不是真的有問題」

> **重要**：v1 計畫書曾誤判這是「rolling 12M 口徑差異」，已撤銷。

用 TWSE 自己 BWIBBU_d 的 `ClosePrice` 反推股利：

| Ticker | TWSE Date | TWSE ClosePrice | TWSE 殖利率 | TWSE 反推股利 | dottdot 股利 | 是否一致 |
|--------|-----------|---------|----------|------------|------------|--------|
| 2330 | 2026-05-05 | 2,250.00 | 0.98% | 22.05 | 22.00 | ✅ |
| 2412 | 2026-05-05 | 136.00 | 3.82% | 5.196 | 5.20 | ✅ |
| 2317 | 2026-05-05 | **239.50** | 3.01% | **7.21** | **7.20** | ✅ |
| 2882 | 2026-05-05 | **77.20** | 4.53% | **3.497** | **3.50** | ✅ |

**4 檔股利完全一致**。差距完全來自「**dottdot/前端有 2026-05-06 收盤、TWSE BWIBBU_d 仍停在 2026-05-05**」造成的分母不同：

| Ticker | dottdot 5/6 收盤 | TWSE 5/5 收盤 | 收盤差距 | 殖利率差（pp）|
|--------|---------|----------|---------|-------------|
| 2317 | 252.00 | 239.50 | +5.2% | -0.15 |
| 2882 | 78.70 | 77.20 | +1.9% | -0.08 |

### 1.3 結論

- **沒有「漏季配 / 漏特別股息」這回事** — dottdot `現金股利合計` 與 TWSE `DividendYear=114` 對齊，年度算法相同
- **驗證腳本本身有 bug** — 日期錯位卻被歸類為「殖利率錯」，需要修
- **參考來源**：[TWSE BWIBBU_d 說明](https://www.twse.com.tw/zh/trading/historical/bwibbu-day.html)、[OpenAPI BWIBBU_d](https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_d)

### 1.4 BWIBBU_d 實際欄位（已確認）

```
{
  "Date": "20260505",            // ← 公告日期，可能與 dottdot 最新報價日不同
  "Code": "2317",
  "Name": "鴻海",
  "ClosePrice": "239.50",        // ← 該日收盤
  "DividendYield": "3.01",       // ← 用 ClosePrice 算的
  "DividendYear": "114",         // ← 民國年（= 2025 年度）
  "PEratio": "17.66",
  "PBratio": "1.89",
  "FiscalYearQuarter": "2025Q4"
}
```

---

## 二、待修問題

### 2.1 驗證腳本 bug（**主要**）

**問題 A：整組 BWIBBU checks 都缺日期保護（不只殖利率）**
- `compare_tier_a.mjs:444` 直接 `bwibbu.find(row => row.code === ticker)`
- BWIBBU 的 `Date` 可能與 dottdot 報價日不同 → 同一檔股票兩日的 PE / PB / 殖利率「分母」全不一樣
- 範例 2317：BWIBBU `Date=20260505 ClosePrice=239.50`、dottdot `日期=2026-05-06 收盤=252` → PE4 / PB / 殖利率三項都會被誤判為 fail
- 後果：所有 BWIBBU 派生欄位（PE4 / PB / DividendYield）都需要先做 date guard

**問題 B：normalizer 漏欄位**
- `lib/fetchers.mjs:146-156` `normalizeBwibbuRow` 只保留 `code/name/dividendYield/pe/pb/fiscalYearQuarter`
- **漏掉 `Date` / `ClosePrice` / `DividendYear`**，導致下游無法做日期保護

**問題 C：比對對象錯**
- 「網頁顯示殖利率」不是 `dottdotQuote["殖利率"]`（dottdot quotes 表沒此欄位）
- 前端是用「`年度現金股利 / 最新收盤 × 100`」自算（[stock_summary.js:244-249](../../js/modules/stock_summary.js)）
- 應該比對「**前端計算結果**」與 TWSE，而非比對 dottdot raw 欄位

**問題 D：`resultRow()` 把 classification / reason 強制清空**
- `compare_tier_a.mjs:43-54` 寫死 `classification: ""` / `reason: ""`，無視 `result.classification` / `result.reason`
- 後果：即使在比對前判定 `date_mismatch` 並寫入 result，到 CSV / md 也會是空白
- 修法：`resultRow()` 改為 `classification: result.classification ?? ""`、`reason: result.reason ?? ""`，並把 markdown 表頭也加上這兩欄

**問題 E：`runTierAComparison()` 沒抓股利政策**
- 目前 `compare_tier_a.mjs:404-429` 並行 fetch quotes / sales / profile / foreign / trust / broker，但**沒抓 `md_cm_ot_dividendpolicy`**
- 問題 C 要重建前端殖利率算法，必須有 dividend data → 需要新增一條 fetch + 傳進 `buildTierAComparisons()`

**問題 F：`--date` 行為不正確**
- `compare_tier_a.mjs:437` `const targetDate = date || latestQuote?.["日期"]`，但 `latestQuote` 永遠是最新 row
- 後果：使用者傳 `--date 2026-05-05` 仍會用 dottdot 5/6 row 比對 5/5 TWSE
- 修法：若有 `--date`，先從 dottdot quotes 找 `日期 === targetDate` 的 row 再比；找不到 → status `missing` + classification `date_mismatch`

### 2.2 UI 備註（**補強**）

殖利率本身沒算錯，但兩個展示位用了不同口徑：

| 區塊 | 算法 | 備註方向 |
|------|------|---------|
| 股票摘要 chip + narrative | `年度現金股利 / 最新收盤`（[stock_summary.js:244-249](../../js/modules/stock_summary.js)）| 「最近年度宣告 / 最新收盤估算；資料日期不一致時可能短暫與證交所略異」 |
| 股利表「年度現金殖利率」欄 | `年度現金股利 / 該年末收盤`（[dividend.js:92](../../js/modules/dividend.js)）| 「以年度宣告現金股利除以該年最後交易日收盤計算」 |

兩者都是合法定義，但對使用者要說清楚以免誤會「為什麼跟其他網站不同」。

---

## 三、選項評估

| 選項 | 做法 | 優點 | 缺點 |
|------|------|------|------|
| **修 1** | 修 `compare_tier_a.mjs` 日期保護 + normalizer 補欄位 + 比對前端計算結果 | 根本解；驗證腳本可信 | 需動 ~30 行 code |
| **修 2** | UI 加備註文字（兩種口徑分開寫）| 對使用者透明 | 不解決腳本 bug |
| ~~**舊 A**~~ | ~~單純加 UI 備註說明 rolling 12M 差異~~ | ~~~~ | **根因不對，撤銷** |

**建議**：**修 1 + 修 2 並行**。修 1 是必須（不修會誤判），修 2 是錦上添花（提升 UX）。

---

## 四、實作步驟

### 4.1 修 1：腳本日期保護（**必做**）

#### 4.1.1 補 normalizer 欄位

`tools/data-verify/lib/fetchers.mjs:146-156`：

```diff
 export function normalizeBwibbuRow(row) {
   if (!row || typeof row !== "object") return null;
   return {
+    date: row.Date ?? row["資料日期"],
+    closePrice: toNumber(row.ClosePrice ?? row["收盤價"]),
     code: row.Code ?? row["證券代號"] ?? row["股票代號"],
     name: row.Name ?? row["證券名稱"] ?? row["股票名稱"],
     dividendYield: toNumber(row.DividendYield ?? row["殖利率(%)"]),
+    dividendYear: row.DividendYear ?? row["股利年度"],
     pe: toNumber(row.PEratio ?? row["本益比"]),
     pb: toNumber(row.PBratio ?? row["股價淨值比"]),
     fiscalYearQuarter: row.FiscalYearQuarter ?? row["財報年/季"],
   };
 }
```

#### 4.1.2 修 `resultRow()` 保留 classification / reason

`compare_tier_a.mjs:43-54`：

```diff
 function resultRow(result, { ticker, date, source }) {
   const needsExplanation = ["fail", "missing"].includes(result.status);
   return {
     ticker,
     date,
     id: result.id,
     label: result.label,
     source,
     status: result.status,
     needs_explanation: needsExplanation ? "yes" : "no",
-    classification: "",
-    reason: "",
+    classification: result.classification ?? "",
+    reason: result.reason ?? "",
     dottdot_value: result.dottdotValue,
     ...
```

並把 markdown report `renderMarkdownReport` 表頭與資料列加上 `classification` 與 `reason` 欄。

#### 4.1.3 整組 BWIBBU checks 都加 date guard（不只殖利率）

PE4 / PB / DividendYield 都依賴 BWIBBU 的 `ClosePrice` 當分母，若 BWIBBU 日期與 dottdot 不同，**全組要 skip**：

```js
// 把 BWIBBU 的 YYYYMMDD 轉成 YYYY-MM-DD
function bwibbuDateToIso(date) {
  if (!date || String(date).length !== 8) return null;
  const s = String(date);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// BWIBBU 派生欄位的 id ↔ label 對照（每個 row 都要有正確 label）
const BWIBBU_FIELDS = [
  { id: "quotes.pe4", label: "本益比4" },
  { id: "quotes.pb", label: "股價淨值比" },
  { id: "quotes.dividend_yield", label: "殖利率（前端計算）" },
];

// BWIBBU checks 開頭先做 date guard
const bwibbuIsoDate = bwibbuDateToIso(bwibbuRow?.date);
const isBwibbuAligned =
  bwibbuRow != null && bwibbuIsoDate === dottdotQuoteDate;

const bwibbuRows = [];
if (!isBwibbuAligned) {
  // 整組 BWIBBU 派生欄位（PE4 / PB / DividendYield）都歸 date_mismatch，不做數值比對
  for (const { id, label } of BWIBBU_FIELDS) {
    bwibbuRows.push(
      resultRow(
        {
          id,
          label,
          status: "skipped_date_mismatch",
          classification: "date_mismatch",
          reason: `BWIBBU=${bwibbuIsoDate ?? "missing"}, dottdot=${dottdotQuoteDate}`,
          dottdotValue: null,
          officialValue: null,
        },
        { ticker, date: dottdotQuoteDate, source: "TWSE BWIBBU_d" },
      ),
    );
  }
} else {
  // 同日才比對：BWIBBU_FIELDS.map(...) 各自做 compareNumeric / 前端計算
  // ... PE4 / PB / Yield 比對，push 進 bwibbuRows
}
return [...quoteChecks, volumeCheck, ...bwibbuRows];
```

#### 4.1.4 `runTierAComparison()` 增加 dividend policy fetch

`compare_tier_a.mjs:404-429` 並行 fetch 區塊新增一條：

```diff
 const [
   dottdotQuotes,
   dottdotSales,
   dottdotProfile,
+  dottdotDividend,
   dottdotForeign,
   dottdotTrust,
   dottdotBroker,
 ] = await Promise.all([
   fetchDottdotTable("md_cm_ta_dailyquotes", { ticker, params: { page_size: 5 }, apiKey }),
   fetchDottdotTable("md_cm_fi_monthsales", { ticker, params: { page_size: 3 }, apiKey })
     .catch((error) => ({ error: error.message, data: [] })),
   fetchDottdotTable("bd_cm_companyprofile", { ticker, params: { page_size: 1 }, apiKey })
     .catch((error) => ({ error: error.message, data: [] })),
+  fetchDottdotTable("md_cm_ot_dividendpolicy", { ticker, params: { page_size: 40 }, apiKey })
+    .catch((error) => ({ error: error.message, data: [] })),
   ...
```

並把 `dottdotDividend.data` 傳進 `buildTierAComparisons()`。

#### 4.1.5 比對前端**計算結果**而非 dottdot raw 欄位

```js
// dottdot quotes 沒有殖利率欄位，要重建前端算法
import { aggregateDividendsToAnnual } from "../../../js/lib/dividend_aggregator.js";

const annual = aggregateDividendsToAnnual(dottdotDividend.data);
const latestCash = annual[0]?.["年度現金股利"];
const close = Number(matchedDottdotQuote["收盤價"]);
const frontendComputedYield =
  Number.isFinite(latestCash) && Number.isFinite(close) && close > 0
    ? (latestCash / close) * 100
    : null;

// 同日前提下：比對 frontendComputedYield vs bwibbuRow.dividendYield
// 容差：TOLERANCES.ratioPercentPoint（0.01）
```

> 注意：股票摘要 chip 與股利表用不同分母（最新收盤 vs 年末收盤），第一版只先驗股票摘要的版本。股利表的版本要另外比對「年末收盤」對齊 BWIBBU 對應日期。

#### 4.1.6 `--date` 參數正確處理

`compare_tier_a.mjs:436-438` 改為：

```diff
- const latestQuote = sortDescByDate(dottdotQuotes.data)[0] ?? null;
- const targetDate = date || latestQuote?.["日期"];
- if (!targetDate) throw new Error("No dottdot quote date available");
+ const sortedQuotes = sortDescByDate(dottdotQuotes.data);
+ const latestQuote = sortedQuotes[0] ?? null;
+ const targetDate = date || latestQuote?.["日期"];
+ if (!targetDate) throw new Error("No dottdot quote date available");
+ // 找對應日期的 dottdot quote row；若找不到，後續比對自動帶 date_mismatch
+ const matchedDottdotQuote =
+   sortedQuotes.find((row) => row["日期"] === targetDate) ?? null;
+ if (date && matchedDottdotQuote == null) {
+   console.warn(
+     `[tier-a] dottdot has no quote row for ${ticker} on ${targetDate}; will mark as missing`,
+   );
+ }
```

下游 `buildTierAComparisons` 改用 `matchedDottdotQuote` 而非 `latestQuote`。`matchedDottdotQuote == null` 時，每個依賴 dottdot quote 的比對自動標 `status: "missing"` + `classification: "date_mismatch"`。

### 4.2 修 2：UI 備註（雙口徑分開）

#### 4.2.1 股票摘要區塊

於 narrative 或 chip 旁加 tooltip / 小字：

```
※ 殖利率以最近年度宣告現金股利 ÷ 最新收盤估算；
  與證交所資料日期不一致時可能短暫略異。
```

修改 [`js/modules/stock_summary.js`](../../js/modules/stock_summary.js)。

#### 4.2.2 股利表

於「年度現金殖利率」表頭加 `?` icon hover tooltip：

```
※ 以年度宣告現金股利 ÷ 該年最後交易日收盤計算（學術慣用口徑）。
```

修改 [`js/modules/dividend.js`](../../js/modules/dividend.js)。

### 4.3 受影響檔案

```
tools/data-verify/lib/fetchers.mjs           （補 BWIBBU normalizer date/closePrice/dividendYear）
tools/data-verify/compare_tier_a.mjs         （resultRow 保留 classification、新增 dividend fetch、整組 BWIBBU date guard、--date 處理、前端計算重建、markdown report 新增 classification/reason 欄）
tools/data-verify/lib/contract.mjs           （MISMATCH_CLASSIFICATIONS 已含 date_mismatch，無需新增）
tests/data_verify.test.js                    （新增約 11 項測試：normalizer 新欄位、bwibbuDateToIso、resultRow 保留分類、整組 BWIBBU date guard、前端殖利率重建、dividend fetch 路徑、--date 處理 found/not-found、markdown report classification 欄、UI 備註）
js/modules/stock_summary.js                  （加備註）
js/modules/dividend.js                       （加表頭 tooltip）
css/style.css                                 （tooltip 樣式，若還沒）
tests/stock_summary.test.js                  （備註存在斷言）
tests/dividend.test.js                        （tooltip 存在斷言）
```

---

## 五、測試計畫

### 5.1 單元測試（新增）

| 測試 | 內容 |
|------|------|
| `normalizeBwibbuRow` 解析新欄位 | `date` / `closePrice` / `dividendYear` 正確抽出 |
| `bwibbuDateToIso` 純函式 | `20260505` → `2026-05-05`；非 8 位 / null → null |
| `resultRow` 保留 result.classification / reason | 餵帶 classification 的 result → 出來的 row classification 不為空 |
| **整組 BWIBBU date guard**：BWIBBU 5/5 + dottdot 5/6 | PE4 / PB / DividendYield 三項全部 status = `skipped_date_mismatch` + classification = `date_mismatch` |
| 前端殖利率重建 | 用同 ticker 的 dividend + quotes raw → 計算值與 [stock_summary.js:244-249](../../js/modules/stock_summary.js) 算法一致 |
| `runTierAComparison` 包含 dividend fetch | mock dottdot client 期望被呼叫 `md_cm_ot_dividendpolicy` 一次 |
| `--date` 找不到對應 row | `matchedDottdotQuote == null` 時 PE4 / PB / volume 等項全標 `missing` + `date_mismatch` |
| `--date` 找到對應 row | dottdot 5/5 row 被選中、不會誤用 5/6 latest |
| markdown report 含 classification 與 reason 欄 | 表頭與資料列都看得到 |
| `renderStockSummary` 含殖利率備註 | DOM 含「年度宣告」字樣 |
| `renderDividend` 表頭含 tooltip | `<th>` 含 `title=` 或 `aria-describedby` |

### 5.2 整合驗證

修 1 上線後重跑 `npm run data:compare:tier-a -- --ticker 2317`：

- 期望結果：殖利率 row 狀態變為 `skipped_date_mismatch` 或 `pass`（若 BWIBBU 已更新到 5/6）
- **不應**再出現 `fail` 但無解釋的情況

### 5.3 視覺驗收

- 4 檔 sample (`2330` / `2317` / `2412` / `2882`)：UI 顯示備註文字、無 layout 破壞
- 320 / 768 / 1440 寬度換行正常

---

## 六、風險與緩解

| 風險 | 機率 | 影響 | 緩解 |
|------|-----|-----|------|
| BWIBBU `Date` 欄位未來改格式 | 低 | 中 | normalizer 多接幾種：`Date` / `資料日期` |
| 前端兩處算法日後分歧（最新收盤 vs 年末收盤）| 中 | 低 | 抽共用函式、文件化 |
| date guard 加上後反而被使用者誤以為「網站慢」 | 低 | 低 | 報告 `reason` 欄填明 BWIBBU 與 dottdot 各自日期 |
| 既有 137 tests 受影響 | 低 | 低 | 修 normalizer 後跑全 test |

---

## 七、驗收條件

- [ ] `normalizeBwibbuRow` 回傳 `date` / `closePrice` / `dividendYear` 欄位
- [ ] `resultRow()` 保留 `result.classification` / `result.reason`，不再強制清空
- [ ] CSV / markdown report 都能看到 `classification` 與 `reason` 兩欄
- [ ] **整組 BWIBBU checks**（PE4 / PB / DividendYield）在 BWIBBU 與 dottdot 日期不一致時自動歸 `date_mismatch`，不再誤判
- [ ] `runTierAComparison()` fetch `md_cm_ot_dividendpolicy`
- [ ] 殖利率比對對象改為「前端計算結果」（年度現金股利 / 最新收盤）
- [ ] `--date` 參數會先在 dottdot quotes 找對應日期 row，找不到則整組標 `missing` + `date_mismatch`
- [ ] 股票摘要區塊顯示「最近年度 / 最新收盤」備註
- [ ] 股利表頭顯示「年度宣告 / 年末收盤」備註
- [ ] 既有 137 tests 全綠
- [ ] 重跑 `npm run data:compare:tier-a` 6 檔，殖利率 fail 數為 0；當 TWSE BWIBBU 落後時自動標 `date_mismatch` 而非 fail

---

## 八、預估工時

| 步驟 | 預估 |
|------|------|
| 4.1.1 normalizer 補欄位 + 測試 | 0.3 hr |
| 4.1.2 resultRow 保留 classification + report 加欄 + 測試 | 0.4 hr |
| 4.1.3 整組 BWIBBU date guard + 測試 | 0.6 hr |
| 4.1.4 dividend fetch 整合 | 0.2 hr |
| 4.1.5 前端算法重建比對 + 測試 | 0.5 hr |
| 4.1.6 `--date` 處理 + 測試 | 0.4 hr |
| 4.2.1 股票摘要備註 + 測試 | 0.3 hr |
| 4.2.2 股利表 tooltip + 測試 | 0.3 hr |
| 5.2 整合驗證重跑 | 0.2 hr |
| 文字定稿與長官溝通 | 0.3 hr |
| **合計** | **~3.5 hr** |

---

## 九、未列入本次範圍

- A 案 PE 標籤（另案計畫）
- 殖利率引入第三方 BWIBBU_d 即時 fetch（不必要，dottdot 算法本來就對）
- dottdot 上游補抓季配明細（**不必要**，季配公司 dottdot 已正確記為「年度合計」）
- 0050 ETF 殖利率（BWIBBU_d 不公布）
- 9999 無效代號

---

## 十、附錄：實際驗證快照（2026-05-06 抓）

### 10.1 BWIBBU_d 4 檔 raw

```
2330: Date=20260505 ClosePrice=2250.00 DividendYield=0.98 DividendYear=114
2317: Date=20260505 ClosePrice=239.50  DividendYield=3.01 DividendYear=114
2412: Date=20260505 ClosePrice=136.00  DividendYield=3.82 DividendYear=114
2882: Date=20260505 ClosePrice=77.20   DividendYield=4.53 DividendYear=114
```

### 10.2 dottdot 對照

```
2330: 5/6 收盤 2,250  / 2025 年度現金股利 22.00 → 0.98% (vs TWSE 5/5: 0.98%) ✅
2317: 5/6 收盤 252.0  / 2025 年度現金股利 7.20  → 2.86% (vs TWSE 5/5: 3.01%) — 因 5/5 收盤是 239.5
2412: 5/6 收盤 136.0  / 2025 年度現金股利 5.20  → 3.82% (vs TWSE 5/5: 3.82%) ✅
2882: 5/6 收盤 78.70  / 2025 年度現金股利 3.50  → 4.45% (vs TWSE 5/5: 4.53%) — 因 5/5 收盤是 77.2
```

### 10.3 反推驗證

| 用 TWSE 自身 close × yield | 反推股利 | dottdot 股利 | 差 |
|---|---|---|---|
| 2330: 2250 × 0.98% | 22.05 | 22.00 | 0.05（捨入）✅ |
| 2317: 239.5 × 3.01% | 7.209 | 7.20 | 0.009（捨入）✅ |
| 2412: 136 × 3.82% | 5.196 | 5.20 | 0.004（捨入）✅ |
| 2882: 77.2 × 4.53% | 3.497 | 3.50 | 0.003（捨入）✅ |

→ **dottdot 股利沒有任何漏配，全 4 檔反推一致**。
