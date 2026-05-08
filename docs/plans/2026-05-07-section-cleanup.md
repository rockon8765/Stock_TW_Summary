# 六區塊調整計畫（2026-05-07）

> **分支**：`feature/layout-claude`
> **Worktree**：`/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov`
> **範圍**：6 個區塊的功能與 UI 調整。
> **不在範圍**：規則邏輯本身（S10–S22）、TWSE/MOPS 自動化擴充、Tier C 商業定義。

---

## 一、需求總覽

| # | 區塊 | 變更類型 | 風險 |
|---|------|---------|------|
| 1 | 股票摘要 — 評分語意反轉（買進分數 → 警示分數）| **語意反轉**（邏輯 + 文字 + 顏色）| 中 |
| 2 | 現金流摘要 — 年季欄位格式化 | UI 文字格式 | 極低 |
| 3 | 月營收 — 12M TTM YoY 為 0 | 資料/算法調查 | 中 |
| 4 | 股權分散表 — 最舊週無變化量 | 抓取量增加 | 低 |
| 5 | 公司治理 — 表頭置中 + 欄位重排 | UI 重排 | 低 |
| 6 | 即時規則警示 — 頻率前置 + 同頻率分組 | 規則順序與 row header 重排 | 低 |

---

## 二、變更詳述

### 2.1 變更 1 — 規則評分語意反轉（買進 → 警示）

#### 現況
[`rule_engine.js:609-637`](../../js/lib/rule_engine.js)：

```js
export function computeBuyScore(latestAvailableCount, latestAlertCount) {
  ...
  const score =
    available === 0 ? null : ((available - triggered) * 10) / available;
  // 7 條規則裡 1 條警示、6 條過 → score = 6/7*10 = 8.57（高分=好）
}
```

[`stock_summary.js:280`](../../js/modules/stock_summary.js)：
```html
<span class="score-card-large">8.6</span>
<span class="stock-summary-score-label">規則評分</span>
警示 1 / 可評估 7 / 資料不足 0
```

語意：**分數越高越好**（沒被警示的規則越多→越值得買）。

#### 長官需求
語意反轉成「**警示分數**」：分數越高代表**越多警示、越不推薦**。

#### 設計

| 項目 | 改動 |
|------|------|
| 計算公式 | `score = triggered * 10 / available` |
| 函式名 | `computeBuyScore` → `computeAlertScore` |
| 回傳欄位 | `score` 語意反轉（不改名，免動下游契約）|
| UI 標籤 | 「規則評分」→ 「警示分數」 |
| 副字仍保留 | 警示 X / 可評估 Y / 資料不足 Z |
| 視覺顏色 | **高分（≥7）紅色（警示）**、中（4–7）橘、低（≤3）綠 |
| K 線 overlay 折線 | 沿用現行黃色（中性）；或反轉色階（紅高綠低）|

#### 受影響檔案

```
js/lib/rule_engine.js                改函式名（computeBuyScore → computeAlertScore）、
                                     改公式為 triggered/available×10、
                                     **同步反轉 computePeriodScores**（line 686 也透過
                                     computeBuyScore 算每期，需確認流向）
js/modules/stock_summary.js          UI 標籤「規則評分」→「警示分數」、副字保留警示計數、
                                     新增分數→顏色映射；narrative 中「規則評分」字樣同步
js/main.js                           const ruleScore = computeBuyScore(...) 改名
js/charts/kline.js                   tooltip 內「規則評分」字串（line ~299）改「警示分數」
                                     overlay 顏色策略待長官確認（先沿用黃色）
index.html                           「※ 規則評分為...」揭露文字（line ~104）改寫
                                     對應新語意（高分 = 警示多、不推薦）
css/style.css                         .score-card-large 加顏色映射 class（.alert-low/-mid/-high）
tests/rule_engine.test.js            既有 buy-score 測試全反轉（含 computePeriodScores 派生）
tests/stock_summary.test.js          narrative / chip 中「規則評分」相關
tests/dom_smoke.test.js              「規則評分」字串斷言改「警示分數」
tests/kline.test.js                  tooltip 中「規則評分」斷言改「警示分數」
```

> **注意**：`computePeriodScores` 也呼叫 `computeBuyScore`（[`rule_engine.js:686-712`](../../js/lib/rule_engine.js)），所以**改一處即動全部 K 線 overlay 點與 latest chip**。改名後同名 callsite 全 grep 一次。

#### 注意事項

- 既有 137+ tests 對 `score` 期望值需要全部反轉（例如「7 條全過 → 10」改為「7 條全過 → 0」）。建議用 sed 批次加 case-by-case review
- 計畫書 / 文件中所有提到「評分越高越好」的描述要同步調整
- ScoreCard Python pipeline 的 BuyScore 與此**完全獨立**（網頁不依賴），不需動

---

### 2.2 變更 2 — 現金流年季欄位格式化

#### 現況
[`cashflow.js:97`](../../js/modules/cashflow.js)：
```html
<td>${escapeHtml(r["年季"] ?? "")}</td>
```

直接顯示 raw 字串如 `202504`。

#### 改法
沿用 [`utils.js:122 formatYearQuarter`](../../js/utils.js)（其他模組已用，例如 `valuation.js`）：

```diff
- import { ... } from "../utils.js";
+ import { formatYearQuarter, ... } from "../utils.js";
- <td>${escapeHtml(r["年季"] ?? "")}</td>
+ <td>${escapeHtml(formatYearQuarter(r["年季"]))}</td>
```

`formatYearQuarter("202504")` → `"2025Q4"`。

#### 受影響檔案

```
js/modules/cashflow.js               import 與單行 td
tests/date_display.test.js           （**沒有 tests/cashflow.test.js**；既有檔已涵蓋年季/年月格式化主題，
                                      把現金流 2025Q4 斷言加進來）
```

---

### 2.3 變更 3 — 月營收 12M TTM YoY 為 0 調查

#### 現況觀察
長官回報：12M TTM YoY 顯示很多 0。

#### 已確認排除的假說

| 假說 | 結論 | 證據 |
|------|------|------|
| ~~A. page_size 不足~~ | **排除** | 即時抓 1101 / 2330 / 2412 各回傳 row_count = 80 |
| ~~B. null 被 UI 轉 0~~ | **排除** | [`utils.js:68 formatPercent(null)`](../../js/utils.js) 回 `—`，不會輸出 0；signedPercent / sumWindow 鏈結中沒有 null→0 的轉換 |

#### 仍需釐清的可能成因

| 假說 | 說明 | 驗證 |
|------|------|------|
| **C** | 真實 0%（current 12 月合計 ≈ previous 12 月合計）| 比對某月 raw 12 月合計 vs 去年 12 月合計 |
| **D** | 計算結果非常小被四捨五入為 `0.00%`（例如 0.005% 顯示為 `0.00%`）| 改用 `toFixed(4)` 或在 0.0049~0.0049 區間特別標註 |
| **E** | 特定股票財報異常（合併口徑變更、資產處分）| 抓「TTM YoY = 0」的具體月份逐筆檢查 |

#### 行動

1. **先把長官提到的具體股票/月份問清楚**（哪檔、哪些月份顯示 0）
2. 跑：
   ```bash
   npm run data:fetch:dottdot -- --datasets sales --tickers 1101,2330,2412 --pageSize 80
   ```
   並對 `tools/data-verify/reports/` 中產出的 JSON 做手動 reconciliation：抽該檔最近 12 個月的 `單月合併營收` raw value，自算 12M TTM YoY，看是否真為 0
3. **若是真 0 / 接近 0 四捨五入**：UI 可選擇加 `tabular-nums` 與 `toFixed(4)` 把細節呈現
4. **若是某些 row 缺值導致 sum=null**：sumWindow 返 null → formatPercent(null) → 「—」（已有正確行為）

#### 同步修：tools/data-verify contract 對齊前端

[`tools/data-verify/lib/contract.mjs:26-29`](../../tools/data-verify/lib/contract.mjs)：

```diff
  {
    key: "sales",
    table: "md_cm_fi_monthsales",
-   defaultParams: { page_size: 24 },
+   defaultParams: { page_size: 80 },
    sections: ["revenue", "stock_summary", "rule_engine"],
  },
```

避免驗證腳本與前端取不同筆數造成假性 mismatch。

#### 受影響檔案（待 1+2 驗證後決定）

```
tools/data-verify/lib/contract.mjs   sales page_size 24 → 80（對齊前端，**先做**）
js/api.js                            如果驗證後仍需要更多 buffer
js/modules/revenue.js                可能的 toFixed 精度提升
tests/revenue.test.js                新增邊界測試（若有改）
tools/data-verify/reports/           診斷數據落盤
```

---

### 2.4 變更 4 — 股權分散表最舊週無變化量

#### 現況
[`api.js:132-141`](../../js/api.js)：
```js
page_size: 12   // 12 週
```

[`shareholders.js:39-71`](../../js/modules/shareholders.js)：
```js
const sorted = sortDescByKey(data, "日期");  // 12 週
// 計算每行的 prev = sorted[i + 1]
// 對最舊一週（i = 11），prev = sorted[12] = undefined → diff = null
```

DISPLAY = 12 週，但要算 diff 需要 13 週資料（每行需要 prev）。

#### 改法

```diff
// js/api.js
  page_size: 12
+ page_size: 20   // 顯示 12 週 + buffer 8 週
```

```diff
// js/modules/shareholders.js（line ~53）
- ${sorted
-   .map((d, i) => {
+ ${sorted
+   .slice(0, DISPLAY_WEEKS)   // ← 必加，否則 page_size 20 會把 20 行全顯示
+   .map((d, i) => {
      ...
-     const prev = sorted[i + 1];
+     const prev = sorted[i + 1];   // ← 不變：仍從完整 sorted 取，最舊一行能取到第 13 週
```

並在檔頂加 `const DISPLAY_WEEKS = 12;` 常數。

#### 受影響檔案

```
js/api.js                            fetchShareholderStructure page_size 12 → 20
js/modules/shareholders.js           sorted.map → sorted.slice(0, DISPLAY_WEEKS).map；
                                     prev 仍從完整 sorted 取
tests/api.test.js                    新增 fetchShareholderStructure page_size = 20 contract test
tests/presentation_consistency.test.js
                                     （**沒有 tests/shareholders.test.js**；既有股權分散斷言在
                                      此檔 line 55+；補一條「最舊行 diff 不為 null」測試）
```

---

### 2.5 變更 5 — 公司治理表 UI 重排

#### 現況
[`insider_governance.js:51-65`](../../js/modules/insider_governance.js)：

| 年月 | 持股% | 增減 | 持股% | 增減 | 持股% | 增減 | 設質比例 |
|---|---|---|---|---|---|---|---|---|---|
|  | 董監 | 董監 | 經理人 | 經理人 | 大股東 | 大股東 | 董監 | 經理人 | 大股東 |

設質被獨立成最後 3 欄。「持股%」內文預設**靠左對齊**（沒有 `text-center` class）。

#### 長官需求
1. 持股% 欄位**置中**
2. 設質比例**塞回各自身份內**：

| 年月 | 董監 |||  經理人 ||| 大股東 |||
|---|---|---|---|---|---|---|---|---|---|
|  | 持股% | 增減 | 設質% | 持股% | 增減 | 設質% | 持股% | 增減 | 設質% |

#### 改法

```diff
// thead colspan
- <th colspan="2">董監</th>
- <th colspan="2">經理人</th>
- <th colspan="2">大股東</th>
- <th colspan="3">設質比例</th>
+ <th colspan="3">董監</th>
+ <th colspan="3">經理人</th>
+ <th colspan="3">大股東</th>
  <tr>
-   <th>持股%</th><th>增減</th>
-   <th>持股%</th><th>增減</th>
-   <th>持股%</th><th>增減</th>
-   <th>董監</th><th>經理人</th><th>大股東</th>
+   <th class="text-center">持股%</th><th>增減</th><th>設質%</th>
+   <th class="text-center">持股%</th><th>增減</th><th>設質%</th>
+   <th class="text-center">持股%</th><th>增減</th><th>設質%</th>
  </tr>

// tbody
- <td>${formatPercent(r["董監持股比例"])}</td>
- <td>${changeCell(r["董監持股比例增減"])}</td>
- <td>${formatPercent(r["經理人持股比例"])}</td>
- <td>${changeCell(r["經理人持股比例增減"])}</td>
- <td>${formatPercent(r["大股東持股比例"])}</td>
- <td>${changeCell(r["大股東持股比例增減"])}</td>
- <td>${pledgeCell(r["董監設質比例"])}</td>
- <td>${pledgeCell(r["經理人設質比例"])}</td>
- <td>${pledgeCell(r["大股東設質比例"])}</td>
+ <td class="text-center">${formatPercent(r["董監持股比例"])}</td>
+ <td>${changeCell(r["董監持股比例增減"])}</td>
+ <td>${pledgeCell(r["董監設質比例"])}</td>
+ <td class="text-center">${formatPercent(r["經理人持股比例"])}</td>
+ <td>${changeCell(r["經理人持股比例增減"])}</td>
+ <td>${pledgeCell(r["經理人設質比例"])}</td>
+ <td class="text-center">${formatPercent(r["大股東持股比例"])}</td>
+ <td>${changeCell(r["大股東持股比例增減"])}</td>
+ <td>${pledgeCell(r["大股東設質比例"])}</td>
```

#### 受影響檔案

```
js/modules/insider_governance.js     表頭 colspan 從 (2,2,2,3) 改為 (3,3,3)；
                                     持股% td 加 text-center
css/style.css                         **新增本地 .text-center utility**：
                                     既有 css/style.css line 46-47 只定義 .text-accent / .text-muted，
                                     `text-center` 目前依賴 Tailwind CDN；為 self-host fallback
                                     穩定性建議補本地 `.text-center { text-align: center; }`
tests/insider_governance.test.js     **新增此檔**（既有 tests/date_display.test.js 已 import
                                     renderInsiderGovernance 但只測年月格式；
                                     table 結構是另一主題，獨立檔較清晰）：
                                     斷言 thead colspan = (3,3,3)、持股% td 含 text-center
```

---

### 2.6 變更 6 — 即時規則警示頻率前置 + 同頻率分組

#### 現況
[`rule_alerts.js:81-90 renderRuleRow`](../../js/modules/rule_alerts.js)：

```html
<th>
  <div class="rule-row-header">
    <span class="rule-name">累積營收連續三個月YOY衰退10%</span>
    <span class="rule-cat-badge">月</span>   ← 頻率 badge 在名稱「後面」
  </div>
</th>
```

[`rule_engine.js:523-574 computeRuleAlerts`](../../js/lib/rule_engine.js) 規則排序：

```
S10 (monthly) → S11 (quarterly) → S12 (quarterly) → S13 (quarterly) → S20 (monthly) → S22 (monthEndDaily) → S17 (monthEndDaily)
```

→ UI 順序：月、季、季、季、月、日(月末)、日(月末)（**月被季隔開、日不連在一起也行但月分散**）。

#### 長官需求

1. **頻率 badge 移到名稱「前面」**：使用者一眼掃左欄就能歸類同類規則
2. **同頻率規則放在一起**（分組顯示）：
   ```
   月       累積營收連續三個月YOY衰退10%
   月       單月營收年增率連兩月衰退
   季       連續兩季單季稅後淨利YOY衰退5%
   季       連續兩季單季營業利益YOY衰退5%
   季       今年以來稅後獲利衰退YOY達10%
   日(月末)  跌破年線且 Alpha250D < -10%（即時近似）
   日(月末)  PB百分位大於80%
   ```

#### 設計

**A. 規則排序：在 `computeRuleAlerts` source 層改順序**（單一真相）

```diff
// js/lib/rule_engine.js computeRuleAlerts
  const rules = [
    { code: "S10", ..., frequency: "monthly" },
+   { code: "S20", ..., frequency: "monthly" },     ← 從第 5 移到第 2
    { code: "S11", ..., frequency: "quarterly" },
    { code: "S12", ..., frequency: "quarterly" },
    { code: "S13", ..., frequency: "quarterly" },
-   { code: "S20", ..., frequency: "monthly" },     ← 移走
    { code: "S22", ..., frequency: "monthEndDaily" },
    { code: "S17", ..., frequency: "monthEndDaily" },
  ]
```

> 為避免未來新增規則順序錯亂，可以在排序前用 `FREQUENCY_ORDER` 常數做穩定排序，但本次只 7 條，手動調整即可。
>
> **副作用評估**：規則順序只影響 `rule_alerts` UI 表的列順序與 `ruleResult.rules` 陣列順序。既有 `latestAlertCount` / `triggered` 等聚合計數**與順序無關**。`computePeriodScores` 也是按 cell index 聚合，不依賴 rule 順序。**安全**。

**B. row header：頻率 badge 移到前面**

```diff
// js/modules/rule_alerts.js renderRuleRow
- <span class="rule-name">${escapeHtml(rule.name)}</span>
- ${frequencyLabel ? `<span class="rule-cat-badge">${escapeHtml(frequencyLabel)}</span>` : ""}
+ ${frequencyLabel ? `<span class="rule-cat-badge">${escapeHtml(frequencyLabel)}</span>` : ""}
+ <span class="rule-name">${escapeHtml(rule.name)}</span>
```

> CSS `.rule-row-header` 用 flex 排版，順序由 DOM 決定。可能需要微調 gap / margin，但不應有 layout 衝擊。

**C.（可選）視覺分組分隔**

若長官想要更明顯的分組，可在不同頻率交界 row 加 border-top 強化：

```css
.rule-row-divider { border-top: 1px solid var(--color-surface-700); }
```

`renderRuleRow` 在前一 row 的 frequency 與當前不同時加 class。**先不做**，等長官看過排序+前置後再決定。

#### 受影響檔案

```
js/lib/rule_engine.js                computeRuleAlerts 中 rules 陣列順序調整（S20 上移到 S10 之後）
js/modules/rule_alerts.js            renderRuleRow 把 badge 移到 name 前面
css/style.css                        （必改）.rule-cat-badge 移除 margin-left: 0.25rem（line 404），
                                     改交給 .rule-row-header 的 gap: 0.25rem 0.5rem 控制間距
tests/rule_engine.test.js            （必改）line 10 的 RULE_CODES 順序更新為
                                     ["S10","S20","S11","S12","S13","S22","S17"]
tests/rule_alerts.test.js            補：rules 順序為 (monthly, monthly, quarterly, quarterly, quarterly,
                                     monthEndDaily, monthEndDaily) 的斷言；
                                     row header DOM 中 badge 在 rule-name 前的斷言
```

---

## 三、實作順序建議

| 順序 | 變更 | 為什麼 |
|------|------|------|
| 1 | 變更 5（公司治理 UI） | 純 UI 重排、最低風險、最快驗證 |
| 2 | 變更 6（規則警示頻率重排）| 純 UI 重排、無語意改變 |
| 3 | 變更 2（現金流年季） | 1 行改動 |
| 4 | 變更 4（股權分散）| 改動小、可獨立驗證 |
| 5 | 變更 3（月營收 0 調查）| **先驗證再行動**：可能根本不需改抓取量 |
| 6 | 變更 1（評分反轉）| 影響最廣（多檔 + 多測試），最後做避免 conflict |

---

## 四、測試計畫

### 4.1 單元測試（新增/修改）

| 變更 | 落點檔案 | 測試 |
|---|---|---|
| 1 | `tests/rule_engine.test.js` | `computeAlertScore`：7/0 → 0、0/7 → 10、3/7 → 4.29；`computePeriodScores` 派生值同步反轉 |
| 1 | `tests/stock_summary.test.js` | `renderStockSummary` DOM 含「警示分數」字串、不含「規則評分」舊字 |
| 1 | `tests/dom_smoke.test.js` | header / disclosure 文字斷言更新 |
| 1 | `tests/kline.test.js` | tooltip row label「警示分數」 |
| 2 | `tests/date_display.test.js` | 現金流年季欄位「2025Q4」 |
| 3 | （視驗證結果決定）| 若需精度提升才補 |
| 4 | `tests/api.test.js` | `fetchShareholderStructure` page_size = 20 |
| 4 | `tests/presentation_consistency.test.js` | 12 行顯示且最舊行 diff 不為 null |
| 5 | `tests/insider_governance.test.js`（**新增**）| 表頭 colspan (3,3,3) 結構 + 持股% td 含 `text-center` |
| 6 | `tests/rule_engine.test.js` | line 10 的 `RULE_CODES` 從 `["S10","S11","S12","S13","S20","S22","S17"]` 改成 `["S10","S20","S11","S12","S13","S22","S17"]` |
| 6 | `tests/rule_alerts.test.js` | 規則順序為 (monthly, monthly, quarterly×3, monthEndDaily×2)；row header DOM 中 `.rule-cat-badge` 在 `.rule-name` 之前 |

### 4.2 視覺驗收

跑 1101、2330、2412 三檔：

- 變更 1：股票摘要區塊顯示「警示分數」+ 對應顏色
- 變更 2：現金流表「年季」欄顯示「2025Q4」格式
- 變更 3（先驗證）：12M TTM YoY 仍顯示原值或改為「—」
- 變更 4：股權分散表最舊一週（如 1/30）有 diff 數值
- 變更 5：公司治理表三大群組各自 3 欄，持股% 置中
- 變更 6：規則警示左欄按頻率分組顯示「月×2 → 季×3 → 日(月末)×2」，且 badge 在規則名稱前（無多餘左縮排）

---

## 五、風險與緩解

| 風險 | 機率 | 影響 | 緩解 |
|---|---|---|---|
| 變更 1 反轉影響 K 線 overlay 視覺意義（黃線高 = 警示）需要使用者重新適應 | 高 | 中 | UI 揭露文字明示新語意；沿用 PR #7 加的「回測視覺化」備註 |
| 變更 1 改名後既有 137+ tests 大量 fail | 高 | 低 | 一次 batch 改、同 PR review |
| 變更 3 真因是 dottdot 上游問題、無法在前端解決 | 中 | 低 | 計畫書 §2.3 已預留「先驗證再行動」分支 |
| 變更 4 page_size 加大被 dottdot guest tier 拒絕 | 低 | 低 | 13/15 也夠；先試 20，被拒降 |
| 變更 5 表頭 colspan 改動破壞既有 dom_smoke 測試 | 中 | 低 | 同 PR 一起改 |

---

## 六、驗收條件

- [ ] 變更 1：股票摘要顯示「警示分數」、分數高=紅色、UI 揭露反轉語意；K 線 overlay 顏色策略與長官確認後落實
- [ ] 變更 2：現金流年季欄全部以 `YYYYQN` 顯示
- [ ] 變更 3：先報告調查結果；若需改抓取量再執行，並補測試
- [ ] 變更 4：股權分散表最舊一週有 diff
- [ ] 變更 5：公司治理表 9 欄三群（每群 3 欄）+ 持股% 置中
- [ ] 變更 6：規則警示表 7 條按頻率分組（月×2 → 季×3 → 日(月末)×2）；頻率 badge 在規則名稱前
- [ ] 既有 163 tests 全綠 + 新增 ≥ 8 條測試
- [ ] 1101 / 2330 / 2412 視覺檢核全通過

---

## 七、預估工時

| 變更 | 預估 |
|------|-----:|
| 5 公司治理 UI 重排 + 測試 | 0.5 hr |
| 6 規則警示頻率重排 + 測試 | 0.3 hr |
| 2 現金流年季格式化 + 測試 | 0.2 hr |
| 4 股權分散 buffer + 測試 | 0.4 hr |
| 3 月營收 0 調查（先實證）| 0.5 hr |
| 3 月營收 修正（若需要）| 0.5 hr |
| 1 評分反轉 — 邏輯 / UI / 顏色 | 1.5 hr |
| 1 評分反轉 — 測試遷移 | 1.0 hr |
| 視覺驗收 + 整合 | 0.5 hr |
| **合計** | **~5.4 hr** |

---

## 八、未列入本次範圍

- A 案 PE 標籤（22.7 vs 34.0 命名）
- Tier C 15 項商業定義覆核
- ScoreCard Python pipeline 的 BuyScore 同步反轉（前端與 Python 是兩套，本次只動前端）
- K 線 overlay 配色（紅高綠低 vs 沿用黃線）— 待長官確認
