# 規則評分擴展至 K 線全時段（2026-05-07）

> **分支**：`feature/layout-claude`
> **Worktree**：`/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov`
> **範圍**：把 K 線圖上的「規則評分（黃色折線）」從**只覆蓋最近 6 期月份**改成**覆蓋整段 K 線可顯示範圍**（最長 5Y）。
> **不在範圍**：規則邏輯本身（S10–S22）、ScoreCard Python pipeline、評分公式、UI 樣式。

---

## 一、需求背景

### 1.1 長官需求

「只要 K 棒有資料就做」——目前評分曲線只顯示最近 6 個月（黃色折線從 ~2026-02 到 ~2026-05），應該擴大到整段 K 線（5Y 內所有月份都要有評分）。

### 1.2 現況證據

抽 1101（台泥）K 線（5Y / 1Y），黃線只覆蓋右下方 4 個月（~2026-02 到 ~2026-05），左邊整段 K 線（2025-06 ~ 2026-01）都沒有評分。

### 1.3 為什麼是「月」不是「日」

7 條規則的天然頻率：

| Rule | 頻率 | 資料來源 |
|------|------|---------|
| S10 / S20 | **月** | `md_cm_fi_monthsales` |
| S11 / S12 / S13 | **季** | `md_cm_fi_is_quarterly` |
| S17 / S22 | **月底快照** | `md_cm_ta_dailyquotes` + `md_cm_ta_dailystatistics` |

**最細自然單位 = 月**。每日重算對基本面類規則（季財報、月營收）並無新訊息；維持月末 cadence 即可。

---

## 二、架構分析

### 2.1 現況設計

寫死 `PERIOD_COUNT = 6` 在兩個檔：

| 檔案 | 用途 |
|------|------|
| [`js/lib/rule_engine.js:10`](../../js/lib/rule_engine.js) | `checkS*(...)` 回傳固定 6 個 period cells |
| [`js/modules/rule_alerts.js:9`](../../js/modules/rule_alerts.js) | UI 表格顯示 6 欄 |

`computePeriodScores(ruleResult)` 也吃 `PERIOD_COUNT = 6`，產生 6 個 score points：

```js
return Array.from({ length: PERIOD_COUNT }, (_, index) => { ... });
```

### 2.2 兩個 consumer 的需求

| Consumer | 需要的期數 |
|---|---|
| **K 線 overlay**（[`kline.js:155-161`](../../js/charts/kline.js)）| **全部**（最長 5Y ≈ 60 月）|
| **`rule_alerts.js` 規則表格 UI** | 只展示**最近 6 期**（既有 UX 不變）|

兩者拆開即可。

### 2.3 既有資料抓取量是否足夠

[`js/api.js`](../../js/api.js) 各 fetcher：

| 資料源 | 現有 fetch 範圍 | 5Y 月評分需求 | 缺口 |
|--------|----------------|---------------|------|
| `quotes`（dailyquotes）| `start: fiveYearsAgo()`、`page_size: 1500` | 所有 5Y 內交易日 | **早期約 1 年的 S17 / S22 lookback 不足** — 5Y 起點之前的資料 API 不會回傳，所以前 250 日無法做 PB 百分位 / MA250 的 lookback |
| `stats`（dailystatistics）| 同上 | 同上 | 同上 |
| `monthsales` | **page_size: 24** | 60 月 axis | ❌ 缺 |
| `incomeQ` | **page_size: 14** | 60 月 ÷ 3 = 20 季 + 季度規則內部 lookback（S11/S12 各需 +5 季 → 取 max = 8 季）= **28 季** | ❌ 缺 |

> **修正前計畫的錯誤**：S10 / S20 並非用 raw 月營收自算 12M YoY，而是直接讀 dottdot 已算好的 `累計合併營收成長`、`單月合併營收年成長`（[`rule_engine.js:100, 277`](../../js/lib/rule_engine.js)）。所以 monthsales 不需要「+12 月 lookback」。
>
> **但 S10 需要 +2 月 lookback**：實作為 `sorted.slice(i, i + 3)` 取連續 3 個月（[`rule_engine.js:94`](../../js/lib/rule_engine.js)）。axis 最舊那一月需要再往前 2 個月才能組成 3 月窗。所以 60 月 axis **至少要 62 筆 monthsales**，否則最舊 1–2 月會被誤判為 N/A。
>
> 因此：**最低 62、實務取 80 保留 buffer**（中央排版 / 跨年補件 / 未來擴充）。

**結論**：
- `monthsales`：24 → **80**（最低 62，實務取 80；含 18 筆 buffer）
- `incomeQ`：14 → **32**（季度規則本身的內部 lookback）
- `quotes / stats`：**接受早期月份 S17 / S22 N/A**（5Y 前 250 日 lookback 拿不到，是 API contract 限制；除非改成抓 `start: 5.7Y ago`，但那會增加抓取量約 14%）

---

## 三、設計方案

### 3.1 動態期數：`PERIOD_COUNT` → `buildPeriodAxis()`

從 `quotes` 推出**月末時間軸**（例如 5Y data → 60 個月末日期）。所有 `checkS*` 不再吃常數 6，而是吃這條時間軸。

```js
// 偽碼
function buildMonthEndAxis(quotes) {
  // 從 quotes 抽出每個月最後一個交易日
  // 回傳 [{ monthLabel: '2021-06', dateIso: '2021-06-30' }, ..., { monthLabel: '2026-05', dateIso: '2026-05-06' }]
}
```

> 「最後一個交易日」取該月份在 quotes 裡實際存在的最後一筆，避免假日 / 非交易月誤判。

### 3.2 `checkS*` 改為接受 axis

每個 rule 的 check 函式改為：

```js
function checkS10(monthsales, axis) {
  return axis.map(({ monthLabel, dateIso }) => {
    // 用 monthLabel 作為 anchor 找對應 monthsales row
    // 計算該月份的 triggered 狀態
  });
}
```

季度規則 S11/S12/S13 在「月份不是季底」時，沿用「**上一個已結算季**」的 triggered 狀態（即同季三個月顯示同一個 cell 結果），這對視覺曲線最自然。

> **重要：這條曲線不是 point-in-time backtest**
>
> dottdot 表沒有「公告日 / 公告生效日」欄位，本實作的「上一個已結算季」是用**該季的年季 label** 推算的最近季底，**不是該季財報實際公告當日**。
>
> 所以圖上 2024Q4 月份顯示的 S11/S12/S13 訊號，**不代表「投資人在該月份就能看到」**——實際上 2024Q4 財報通常 2025-03 才公告，但黃線在 2025-01 / 2025-02 就會反映 2024Q4 的觸發狀態。
>
> **解讀方式：「以目前可得資料回填各月份的規則狀態」**，等同 in-sample 視覺化，**不是嚴格的歷史可投資訊號**。需要 point-in-time 訊號的話，必須等 dottdot 補上公告日欄位後另案處理。
>
> 計畫書的所有圖文（特別是給長官看的 chip / overlay）需明示這一點，避免誤判為「當時就能進場」訊號。

### 3.3 兩種輸出

`computeRuleAlerts({...})` 回傳：

```ts
{
  rules: Array<{
    code, name, frequency, detail,
    periods: Period[],     // 全部 N 期（給 kline overlay）
    recentPeriods: Period[],  // 最後 6 期（給 rule_alerts 表格 UI）
    latest, triggered
  }>,
  alertCount, latestAlertCount, latestAvailableCount, latestNaCount,
  // 額外：完整評分序列
  fullPeriodScores: Array<{ date, label, score, available, triggered, na }>,
  recentPeriodScores: Array<...>  // 最後 6 期，供既有 UI 使用
}
```

### 3.4 UI 改動最小化

| 區塊 | 改法 |
|------|------|
| `rule_alerts.js` 表格 | 改吃 `rule.recentPeriods ?? rule.periods.slice(-RECENT_PERIOD_COUNT)`，仍顯示 6 欄 |
| `kline.js` overlay | 改吃 `fullPeriodScores`，畫滿整條曲線 |
| `stock_summary.js` 規則評分 chip | 不變（吃 `latestAlertCount` 等 latest 統計）|

> **重要**：`rule_alerts.js:22-24` 目前是 `periods.slice(0, PERIOD_COUNT)`（取**前** 6 個），這在「全長度 = 6」時剛好正確，但若 fallback 到 full history 會取最舊 6 期，方向反掉。因此：
> - **必須**改為 `slice(-RECENT_PERIOD_COUNT)`（取最近 6 個），或更乾淨的 `rule.recentPeriods`
> - fallback 路徑也要用 `slice(-RECENT_PERIOD_COUNT)`，不可保留舊的 `slice(0, ...)`

### 3.5 API page_size 增加

| 檔案 | 改動 |
|------|------|
| `js/api.js` `fetchMonthSales` | `page_size: 24 → 80`（覆蓋 60 月 + 20 月 buffer，buffer 純粹給未來擴充）|
| `js/api.js` `fetchQuarterlyIncome` | `page_size: 14 → 32`（覆蓋 60 月 = 20 季 + 季度規則內部 lookback 8 季 + 4 季 buffer）|

> 評估：dottdot guest API 應允許 80–100 row 範圍（既有 `quotes: 1500` 沒問題）。第一輪先試 80/32，若被拒再降。
> `quotes / stats` 不調整：`start: fiveYearsAgo()` 是 5Y window 的硬限制，前 250 日 lookback 不足由「N/A 不畫點」處理。

### 3.6 UI 揭露：黃線非 point-in-time

K 線 overlay 上方或圖表 caption 加一行小字：

```
※ 規則評分為「以目前可得資料回填各月份」的回測視覺化，
   非歷史可投資訊號（季財報公告日延遲未列入計算）。
```

放在 [`index.html` K 線 section](../../index.html) 或 `kline.js` 圖表上方。文字定稿待長官敲。

---

## 四、實作步驟

### 4.1 拆 `PERIOD_COUNT` 常數依賴（先重構，不改行為）

| 步驟 | 內容 |
|------|------|
| 4.1.1 | 在 `rule_engine.js` 新增 `buildMonthEndAxis(quotes)` 純函式 |
| 4.1.2 | 把 `checkS10 / S11 / ... / S22` 改為接受 `axis` 參數，回傳長度 = axis.length 的 cell 陣列 |
| 4.1.3 | `computeRuleAlerts({...})` 改為接收 `axis = buildMonthEndAxis(quotes)`，並產出 `fullPeriodScores` 與 `recentPeriodScores` |
| 4.1.4 | 為了向後相容，`PERIOD_COUNT = 6` 改為「`RECENT_PERIOD_COUNT`」，僅供「最近 6 期」邏輯使用 |

### 4.2 wire 兩個 consumer

| 步驟 | 內容 |
|------|------|
| 4.2.1 | `rule_alerts.js` 改吃 `rule.recentPeriods`（API 不變，只是來源從 `periods` → `recentPeriods`）|
| 4.2.2 | `main.js:341` 改傳 `ruleResult.fullPeriodScores` 給 `setRuleScoreOverlay` |

### 4.3 增加資料抓取量

| 步驟 | 內容 |
|------|------|
| 4.3.1 | `js/api.js` `fetchMonthSales` page_size 24 → 80 |
| 4.3.2 | `js/api.js` `fetchQuarterlyIncome` page_size 14 → 32 |

### 4.4 容錯處理（兩層 axis）

axis 來源**不只看 quotes**——quotes 缺時，UI 表格仍應該能呈現最近 6 期的月營收/季財報規則。設計兩個 axis：

| axis 種類 | 來源 | 用於 |
|---------|------|------|
| `fullAxis` | quotes 月末（5Y）| K 線 overlay (`fullPeriodScores`) |
| `recentFallbackAxis` | 若 quotes 缺，從 monthsales 倒推最近 6 個月；再缺則從 incomeQ 倒推最近 6 季 | UI 表格 (`recentPeriods`) |

容錯規則：

- 若 `quotes` 缺：`fullPeriodScores = []`、K 線無 overlay；但 `recentPeriods` 仍從 monthsales / incomeQ 推得 → UI 表格不會空白
- 若 `monthsales` 也缺：S10 / S20 該欄全 N/A，但季度規則仍可
- 若 `incomeQ` 也缺：所有規則退化，表格全 N/A 才合理
- 若某月 `monthsales` 中該月 row 缺：該月評分點為 N/A（不畫點）
- 若整段曲線過長造成效能問題：在 `kline.js` 加 `slice(-MAX_OVERLAY_POINTS)` 護欄（門檻例如 240）

---

## 五、測試計畫

### 5.1 單元測試（新增）

| 函式 | 測試案例 |
|------|---------|
| `buildMonthEndAxis(quotes)` | 5Y 資料 → 約 60 筆；缺月份不誤判；空陣列 → []；只取每月最後一個交易日 |
| `checkS10(monthsales, axis)` | 給 72 月 monthsales、60 月 axis → 60 cells；早期月份有 N/A 沒問題 |
| `checkS11(...)` 同上 | 季度規則：相同季內 3 個月 cell 應該等價 |
| `computeRuleAlerts({...}).fullPeriodScores` | 60 月資料 → 60 個 score points；`recentPeriodScores` = 最後 6 個 |

### 5.2 既有測試遷移

`tests/rule_engine.test.js`、`tests/rule_alerts.test.js` 既有斷言以 `PERIOD_COUNT = 6` 為前提：

- `rule_alerts.js` UI 仍 6 欄 → 既有測試多數不變，只是 prop 從 `periods` → `recentPeriods`
- `rule_engine.test.js` 若直接斷言 `periods.length === 6`，需改為 `recentPeriods.length === 6`

### 5.3 視覺驗證

跑 1101、2330、0050：
- K 線拉到 5Y → 黃線應覆蓋整段（不再縮在右下角）
- 1Y / 3M 視窗 → 黃線剛好覆蓋對應月數
- ETF（0050）規則多為 N/A → 黃線該段無點，不破圖

### 5.4 效能驗證

- 跑 2330（5Y 約 1250 quotes、60 月 axis）→ `computeRuleAlerts` 應 < 200ms
- 7 rules × 60 cells × ~250-row lookback for S17/S22 = 約 105K row reads
- Chrome DevTools Performance 跑一次切換 ticker

---

## 六、風險與緩解

| 風險 | 機率 | 影響 | 緩解 |
|------|-----|-----|------|
| dottdot guest API page_size 80 / 32 被拒 | 低 | 中 | 先以實際 fetch 試；若拒，分頁抓或降到 60 / 24 |
| S17 / S22 在 60 月 axis × 250 日 lookback 效能不佳 | 中 | 低 | 把 lookback window 提前排序快取；最佳化 `monthEndRows` |
| 早期 ~12 月 S17 / S22 N/A（5Y 前 lookback 無資料）| 高 | **低**（只是少 2 條規則，不會讓 score 為 null）| `computeBuyScore` 只要 `available > 0` 就有分數；早期月份仍可畫，只是基於 5 條規則。計畫書 §2.3 已明示為 API contract 限制 |
| `rule_alerts.js` slice 方向錯（`slice(0, 6)` 取最舊）| 高（若忘記改）| 高（顯示舊資料）| 4.2.1 必須改為 `slice(-RECENT_PERIOD_COUNT)` 或 `recentPeriods`；加 regression test |
| 季度規則跨月顯示讓人誤以為是 point-in-time 訊號 | 中 | 中 | 計畫書 §3.2 / 3.6 明示、UI 加揭露文字 |
| 既有 156 tests 因 `periods.length` 改變而失敗 | 高 | 低 | 4.1.4 保留 `recentPeriods` 給 UI 測試 |
| `kline.js` overlay 拉長後 hover tooltip 效能差 | 低 | 低 | 既有 tooltip 已 O(1)，無關 series 長度 |
| quotes 缺資料時整個 UI 表格也空白 | 中 | 中 | 4.4 雙層 axis：表格用 `recentFallbackAxis` 從 monthsales / incomeQ 倒推 |

---

## 七、驗收條件

- [ ] 5Y K 線範圍下，黃色評分曲線**至少覆蓋最近 ~48 個月**；早期 ~12 月雖 S17/S22 N/A，但只要其他規則（S10/S11/S12/S13/S20）尚有資料、`available > 0`，`computeBuyScore` 仍會給出分數（[`rule_engine.js:445`](../../js/lib/rule_engine.js)），因此早期月份仍可畫分數，只是 score 是基於 5 條規則而非 7 條
- [ ] `rule_alerts.js` 表格仍 6 欄、且顯示**最近** 6 期（不是最舊 6 期）— 加 regression test 防退化
- [ ] `rule_alerts` 在 quotes 缺資料時，仍能從 monthsales / incomeQ 倒推顯示最近 6 期
- [ ] UI 加上「規則評分為回測視覺化、非 point-in-time 訊號」揭露文字（位置由長官敲定）
- [ ] 既有 156 tests 全綠 + 新增至少 5 條測試（axis 構造、cell length、季度跨月對齊、score series 完整度、quotes 缺資料 fallback）
- [ ] 切換 ticker 5 次無 console error，hover tooltip 仍顯示正確當日評分（若該日是月末）
- [ ] 早期月份（資料不足）顯示為「斷點」而非錯誤
- [ ] 1101 / 2330 / 0050 視覺檢核通過

---

## 八、預估工時

| 步驟 | 預估 |
|------|-----:|
| 4.1.1 buildMonthEndAxis + 測試 | 0.5 hr |
| 4.1.2 改 7 條 checkS* + 測試 | 1.5 hr |
| 4.1.3 computeRuleAlerts 拆 full / recent | 0.5 hr |
| 4.1.4 PERIOD_COUNT 改名重構 | 0.3 hr |
| 4.2.1 `rule_alerts.js` slice 方向修正 + fallback + regression test | 0.4 hr |
| 4.2.2 wire kline overlay 吃 fullPeriodScores | 0.2 hr |
| 4.3 api.js page_size 調整 | 0.2 hr |
| 4.4 雙層 axis（quotes 缺資料 fallback）+ 測試 | 0.4 hr |
| 3.6 UI 揭露文字 + 文字定稿 | 0.3 hr |
| 5.1–5.2 測試遷移與新增 | 0.8 hr |
| 5.3–5.4 視覺與效能驗證 | 0.5 hr |
| **合計** | **~5.6 hr** |

---

## 九、未列入本次範圍

- 規則邏輯本身（S10–S22）的算法不變
- ScoreCard Python pipeline 無關
- 評分公式 `computeBuyScore` 不變
- K 線 overlay 樣式（顏色 / 寬度）不變
- UI 表格擴展為「N 欄」（保留為未來想法）
- 規則評分**日**頻（不必要、無新訊息）

---

## 十、附錄：時間軸範例

5Y K 線範圍下，axis 大致為：

```
[
  { monthLabel: '2021-06', dateIso: '2021-06-30' },
  { monthLabel: '2021-07', dateIso: '2021-07-30' },
  ...
  { monthLabel: '2026-04', dateIso: '2026-04-30' },
  { monthLabel: '2026-05', dateIso: '2026-05-06' }   // 最後一個 = K 線最末日
]
```

每月一個 score point，`computePeriodScores` 對每個 axis entry 算 `{ score, available, triggered, na }`，最終餵給 `setRuleScoreOverlay()` 變成 60 點折線。
