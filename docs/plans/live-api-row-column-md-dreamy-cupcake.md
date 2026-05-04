# 多區塊改造規劃（六項合一）

> 本檔案為當前的「dreamy-cupcake」改造計畫。前一版「即時規則警示近 6 期表格化」內容已被本次 6 項改造規劃整合 / 取代，部分 Item（例如 Item 4 的 `computeBuyScore`、Item 5 的 `computePeriodScores`）建立在規則警示既有實作之上。

## Context

長官希望對 `feature/layout-claude` 分支（worktree: `.claude/worktrees/eager-liskov/`）的單檔股票報表做 **6 項改造**，主軸是**縮短決策路徑**——讓他看完 K 線圖、摘要、評分後就能決定要不要往下捲看細節。

6 項目如下（後文每項一節展開）：
1. 「估值趨勢（近 8 季）」與「季度損益（近 8 季）」幾乎重疊：保留估值位置、用季度損益內容取代，但**保留每股淨值**欄位，移除季度損益區塊。
2. 「月營收（近 12 個月）」加上多種 YoY 變體（含前端計算的 3M Rolling 與 12M TTM）。
3. 「三大法人買賣超（近 30 日）」的 3 個摘要卡片從表格下方移到**表格上方**。
4. 「即時規則警示」7 條件狀態 → 換算成 0–10 評分。長官提的 `通過數 × 10 / 7` 在 sell-rule 語境下方向倒轉，需改用 NA-fair 倒推公式。
5. 把上述評分（過去 6 期）視覺化**疊加到 K 線圖**，比對評分與股價趨勢一致性。
6. 在 K 線圖和規則警示之間插入新「**股票摘要**」區塊，含當期評分、估值、成長、走勢四張卡片。

資料來源：Dottdot API（`https://data.dottdot.com/docs`，API key 在 `.env`）。

## Locked-in decisions（已和使用者確認）

| 決策點 | 決議 |
|---|---|
| Item 1 整併欄位 | **保留每股淨值** → 共 7 欄（年季 / 營收淨額 / 毛利率 / 營益率 / 淨利率 / EPS / 每股淨值） |
| Item 2 YoY 變體 | **4 種全要**：單月 YoY、累計 YTD YoY、3M Rolling YoY、12M TTM YoY |
| Item 6 摘要內容 | 4 張卡片全要：規則評分 / 估值風險 / 成長動能 / 走勢風險。**規則評分卡片只顯示當期分數**（非六期） |

## 推薦/預設項（plan 自選，可被 reviewer 覆蓋）

| 決策點 | 推薦 |
|---|---|
| Item 1 整併後標題 | 從「估值趨勢（近 8 季）」改為「**季度財務（近 8 季）**」（內容不再單純估值，要避免誤導）。若不想動標題保留「估值趨勢」也可。 |
| Item 4 評分公式 | `score = (available − triggered) × 10 / max(available, 1)`，NA-fair；公式詳見 §Item 4。 |
| Item 5 K 線疊加形式 | LineSeries 在 K 線圖右側 secondary y-axis（0–10 範圍），月末日為 x 軸 anchor，6 個資料點。 |
| Item 6 區塊位置實作 | 把 `#rule-alerts-container` 從 `<section id="section-profile">` **移出獨立**成 `<section id="section-rule-alerts">`，放在 K 線圖之後；新摘要區塊放在 K 線圖和（新獨立的）規則警示之間。 |

---

## Item 1：估值趨勢 ↔ 季度損益 整併

### 現況

| | 估值趨勢 | 季度損益 |
|---|---|---|
| Section ID | `section-valuation` (index.html:107) | `section-income` (index.html:144) |
| 容器 ID | `valuation-table-container` | `income-table-container` |
| 模組 | [`js/modules/valuation.js`](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/modules/valuation.js) | [`js/modules/income.js`](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/modules/income.js) |
| 資料來源 | `fetchQuarterlyIncome` + `fetchQuarterlyBS` | `fetchQuarterlyIncome` |
| 欄位 | 年季、營收(億)、毛利率、營益率、稅後EPS、每股淨值 | 年季、營收淨額、毛利率、營益率、淨利率、EPS |
| main.js 呼叫點 | line 339 `renderValuation(income, bs)` | line 396 `renderIncome(income)` |

### 改動

新整併區塊保留 `section-valuation` 位置、`valuation-table-container` 容器，標題建議改為「季度財務（近 8 季）」。表格 7 欄：

| 年季 | 營收淨額 | 毛利率 | 營益率 | 淨利率 | EPS | 每股淨值 |
|---|---|---|---|---|---|---|

**欄位來源備註**：
- `年季`、`營收淨額`、`毛利率`、`營益率`、`淨利率`、`EPS` ← `fetchQuarterlyIncome` 的 `稅後純益`、`營業收入淨額`、`營業毛利淨額`、`營業利益`、`每股稅後盈餘`
- `每股淨值` ← `fetchQuarterlyBS` 的 `每股淨值`，以 `年季` join

`稅後純益 / 營業收入淨額` 計算淨利率時與 income.js 既有邏輯一致；保留 `valClassLevel()` 對毛/營/淨利率的條件樣式。

### Files to modify

| 檔案 | 改動 |
|---|---|
| `js/modules/valuation.js` | 重寫：合併 income.js 的 6 欄 + 既有 `每股淨值`，共 7 欄；保留 `(income, bs)` 簽名 |
| `js/modules/income.js` | 廢除：保留檔案 + export 但加 `/* deprecated: merged into valuation.js */` 註解，main.js 不再呼叫；下個 release 評估完全刪除 |
| `index.html` | 移除 `<section id="section-income">` 整段（line 144–150 附近）；月營收 grid `lg:grid-cols-2` 變獨佔 → 改為 `lg:grid-cols-1` 或讓出右欄給其他內容；更新 `section-valuation` 標題 |
| `js/main.js` | 移除 line 396 的 `renderIncome(data.income.data)` 呼叫；保留 line 339 的 `renderValuation(data.income.data, data.bs?.data)` |
| `tests/income.test.js` | 標 deprecated 或刪除 |
| `tests/valuation.test.js` | 重寫：對應 7 欄；新增「淨利率」測試；確認 `每股淨值` 透過 `bs` 正確 join |

### 風險

- 月營收 grid 變獨佔後右側空白：可考慮把月營收佔滿一整 row（`lg:grid-cols-1` over the whole row），或在右側補新內容（不在本 plan 範圍）。
- 既有 audit / docs 提到的「估值趨勢」字樣需更新（grep 找）。
- `tests/valuation.test.js` 既有測試只驗 6 欄，需擴。

---

## Item 2：月營收新增 YoY 變體

### API 現況

`fetchMonthSales` (api.js:77, page_size 12) 提供：
- `年月`、`單月合併營收`、`單月合併營收月變動` (MoM%)、`單月合併營收年成長` (單月 YoY%)、`累計合併營收`、`累計合併營收成長` (累計 YTD YoY%)

API **不**直給 3M Rolling 或 12M TTM，需前端從 `單月合併營收` raw 數列計算。

### 4 種 YoY 計算

| 欄位 | 來源 | 計算 |
|---|---|---|
| 單月 YoY | API 直給 | `單月合併營收年成長` |
| 累計 YTD YoY | API 直給 | `累計合併營收成長` |
| **3M Rolling YoY** | 前端計算 | `(sum(M, M-1, M-2) of 單月合併營收) / (sum(M-12, M-13, M-14) of 單月合併營收) − 1`，× 100 |
| **12M TTM YoY** | 前端計算 | `(sum(M..M-11) of 單月合併營收) / (sum(M-12..M-23) of 單月合併營收) − 1`，× 100 |

### Page_size 升級

12M TTM 對最舊 row（M-11）需要再往前 12 個月歷史 → 共 23 個月。3M Rolling 對 M-11 需要再往前 14 個月 → 共 14 個月。**page_size 由 12 升到 24** 可覆蓋大部分 row 的計算需求；最舊 1–2 row 仍可能 N/A，UI 顯示 `—`。若想全 12 row 都算得出，需升到 36；保守選 24，over-fetch 較少。

### 8 欄表格

| 年月 | 單月營收 | MoM% | 單月 YoY% | 3M YoY% | 12M TTM YoY% | 累計營收 | 累計 YTD YoY% |
|---|---|---|---|---|---|---|---|

8 欄會比現行寬，手機橫向捲動（既有 `.overflow-x-auto`）。可考慮把 `累計營收` 欄位收進 tooltip 以節省寬度，但不在預設範圍。

### Files to modify

| 檔案 | 改動 |
|---|---|
| `js/api.js` | `fetchMonthSales` page_size 12 → 24 |
| `js/modules/revenue.js` | 加 helpers `computeRollingYoy(rows, anchorIdx, window)`；表頭和 row 渲染加兩欄；最舊 row 算不出顯示 `—` |
| `tests/revenue.test.js` | 補測試：3M / 12M 計算精度、跨年邊界、最舊 row N/A、負成長、page_size=24 mock fetch |

### Page_size downstream audit

`data.sales` 的 consumer：
- [`rule_engine.js`](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/lib/rule_engine.js) 的 `checkS10` / `checkS20`：需要 8 個月，24 個月夠用且不影響邏輯（仍取前 8 月 anchor）。
- `js/modules/revenue.js`：表格只渲染最近 12 個 row；多餘的歷史用於計算 rolling，不影響顯示量。

風險低，但測試要明確驗 revenue 表只渲染 12 row。

---

## Item 3：三大法人卡片移到表格上方

### 現況

[`index.html` line 171–181](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/index.html)：
```html
<section id="section-institutional">
  <h2>三大法人買賣超（近 30 日）</h2>
  <div id="institutional-table-container">...</div>   <!-- 表格在上 -->
  <div id="institutional-cards" class="grid ...">...</div>  <!-- 卡片在下 -->
</section>
```

[`institutional.js renderInstitutional`](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/modules/institutional.js) 內先填 table container 再填 cards container。

### 改動

純粹順序調換：

```html
<section id="section-institutional">
  <h2>三大法人買賣超（近 30 日）</h2>
  <div id="institutional-cards">...</div>             <!-- 卡片在上 -->
  <div id="institutional-table-container">...</div>   <!-- 表格在下 -->
</section>
```

`institutional.js` 內部呼叫順序顛倒（先 `renderSummaryCards`、再 table 渲染）。

### Files to modify

| 檔案 | 改動 |
|---|---|
| `index.html` | 把 `<div id="institutional-cards">` 移到 `<div id="institutional-table-container">` 之前；補 margin-bottom class（cards 在上時需要與 table 隔開） |
| `js/modules/institutional.js` | `renderInstitutional` 內先 `renderSummaryCards`、再 table；其他邏輯不動 |
| `tests/institutional.test.js`（若有） | DOM order assertion 對齊新順序 |

風險：CSS `mb-4` 既有放在 table 容器上（cards 在下時是 cards 容器需要 `mt-4`）；現在反過來，cards 在上要 `mb-4`，table 在下不需 `mt-4`。手動確認間距 ok。

---

## Item 4：規則評分公式（0–10）

### 為什麼長官提的 `通過數 × 10 / 7` 不對

7 條 sell rules 的 `triggered = true` 意味「該條件觸發 = 不利訊號」。把「通過數（即 triggered 數）」直接乘以 10/7，會給「7 條全部觸發」的股票滿分 10 分——**方向倒轉**。

### 推薦公式（NA-fair 倒推）

```
let available = latestAvailableCount;  // latest 期能算出 true/false 的規則數（0..7）
let triggered = latestAlertCount;       // latest 期 triggered === true 的規則數（≤ available）

if (available === 0) {
  score = null;                          // 顯示「資料不足」
} else {
  score = ((available - triggered) * 10) / available;
}
```

範例：

| available | triggered | score | 解讀 |
|---|---|---|---|
| 7 | 0 | 10.00 | 全 OK |
| 7 | 3 | 5.71 | 3 條紅旗 |
| 7 | 7 | 0.00 | 全紅旗 |
| 5 | 2 | 6.00 | 2 條紅旗、2 條 NA 不算分 |
| 0 | 0 | null | 完全沒資料 |

### 為什麼 NA-fair（除以 available 而非除以 7）

若有 2 條 NA、2 條 triggered、3 條 OK：
- 除以 7：score = (7-2-2)*10/7 ≈ 4.29（把 NA 當 triggered 扣分，太懲罰新上市/小股）
- 除以 7（把 NA 當 OK）：score = (7-2)*10/7 ≈ 7.14（把 NA 當好評，太樂觀）
- **除以 available = 5**：score = (5-2)*10/5 = 6.00（NA 不算分，公平）

NA-fair 的代價：分母會變動，不同股票的「滿分意義」不同。所以 UI 上一定要同時顯示 `available / 7` 和 `triggered / available` 才不會誤導。

### 替代方案（v2 backlog，本 plan 不做）

- **嚴重度加權**：每條 rule 給不同權重（如 S22 跌破年線 = 3、S17 PB 高 = 1）。需歷史驗證。
- **平滑（過去 6 期平均）**：減少單期劇變。Item 6 user 確認只顯示當期，但可作為輔助欄位。
- **指數衰減**：近期 weight 大、舊期 weight 小。

### Files to modify

| 檔案 | 改動 |
|---|---|
| `js/lib/rule_engine.js` | 新增 export `computeBuyScore(latestAvailableCount, latestAlertCount)` → 回 `{ score: number\|null, displayText, available, triggered }` |
| `tests/rule_engine.test.js` | 新測試：score 計算精度（含 5 個 example case）、available=0 邊界、triggered > available 防禦 |

---

## Item 5：規則評分歷史 6 期 → K 線圖疊加

### 範圍 & 限制

- 範圍：**過去 6 期**（rule engine 既有 lookback）。Period 對齊月末日（沿用先前 normalization）。
- K 線預設 5Y 範圍下，6 期會擠在右側一小段。建議實作後手動驗證 1Y / 6M 範圍，視覺較好；可以後續把 K 線預設改 1Y。

### 6 期 → 6 個 data point 的對齊

每條 rule 有自己的 6 期 anchor（月頻、季頻、月末日頻不同），合成「整體 score 的 6 期」需要共同 x 軸：

- **共同 x 軸 = 月末日**（沿用 rule_engine 對日頻 rule 的 normalization）
- 每個月末（共 6 個）計算當月各 rule 的 latest 狀態 → 該月的整體 score
- 月頻 rule (S10/S20)：用該月的 anchor 結果
- 季頻 rule (S11/S12/S13)：用該月時點最近**已完成**季的結果（同季的多個月共用同個值；當月若在新一季開始時切換）
- 月末日頻 rule (S17/S22)：直接用該月末的結果

### Implementation

新增 `computePeriodScores(rulesResult)` 在 `rule_engine.js`：

```js
export function computePeriodScores(rulesResult) {
  // 從 rulesResult.rules[].periods 抽取 6 個月末 anchor 日期
  // 對每個 anchor 計算當月 (available, triggered) → score
  // 回傳 [{ date: "YYYY-MM-DD", label: "YYYY-MM", score, available, triggered, na }] 6 筆 oldest-first
}
```

在 [`js/charts/kline.js`](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/charts/kline.js) 新增：

```js
let scoreOverlaySeries = null;

function ensureScoreSeries() {
  if (scoreOverlaySeries) return;
  // lightweight-charts: addSeries(LineSeries, {priceScaleId: "score", color: "#fbbf24", lineWidth: 2})
  // chart.priceScale("score").applyOptions({ scaleMargins: { top: 0.1, bottom: 0.7 }, mode: 1 });
  // 設定 mode=1 讓 score 軸獨立、不影響 candle 軸
}

export function setRuleScoreOverlay(periodScores) {
  ensureScoreSeries();
  const data = periodScores
    .filter((p) => p.score != null)
    .map((p) => ({ time: p.date, value: p.score }));
  scoreOverlaySeries.setData(data);
}
```

`main.js` 整合：rule alerts 計算（既有 line 322 附近）後呼叫：

```js
const periodScores = computePeriodScores(ruleResult);
setRuleScoreOverlay(periodScores);
```

### 視覺設計

- 顏色：`#fbbf24`（amber），與紅綠燭線明顯區分。
- 線寬 2，無填充（不要 AreaSeries，避免與燭線爭視覺）。
- secondary y-axis（右側），0–10 範圍。
- `priceScale("score")` 的 `scaleMargins: { top: 0.1, bottom: 0.7 }`——讓評分線只佔上方 30% 的高度，不影響燭線顯示。

### Files to modify

| 檔案 | 改動 |
|---|---|
| `js/lib/rule_engine.js` | 新增 `computePeriodScores` |
| `js/charts/kline.js` | 新增 `scoreOverlaySeries` 建立 + `setRuleScoreOverlay` export；修 `setRange` 讓篩出的時間視窗不會 hide score（score 點都在過去 6 個月，1Y 以下範圍可能 cut 掉舊期，可接受） |
| `js/main.js` | 在 rule alerts 計算後呼叫 `setRuleScoreOverlay(computePeriodScores(ruleResult))` |
| `tests/rule_engine.test.js` | 新測試：`computePeriodScores` 回 6 筆、月末對齊、季頻 rule 在同季不同月共用值、available=0 月顯示 null |
| `tests/kline.test.js` | 新測試：`setRuleScoreOverlay` 後 series 有 6 筆資料、null 期被 filter 掉 |

### v2 backlog（不在本 plan）

擴充 rule engine 算更長歷史（如 24 個月、36 個月），讓 K 線圖在 5Y 範圍下也能看到完整歷史評分趨勢。需要顯著增加 API 抓取與計算量。

---

## Item 6：新增「股票摘要」區塊

### 區塊位置（重要結構變動）

長官說「在 K 線圖和規則警示之間插入新區塊」，但目前 `#rule-alerts-container` 在 [`<section id="section-profile">`](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/index.html) **內部**，位於 K 線圖**前**（不是後）。要符合長官語意，必須**先把 rule alerts 移出 profile 獨立**，然後才能在它和 K 線圖之間插入摘要。

新區塊順序：

```
1. <section id="section-profile">              （Profile 不再含 rule alerts）
2. <section id="section-kline">                 K 線圖
3. <section id="section-stock-summary"> NEW    股票摘要 ← 插入
4. <section id="section-rule-alerts"> MOVED    即時規則警示（從 profile 移出）
5. <section id="section-strategy-scores">      策略買入分數
6. <section id="section-valuation">            季度財務（Item 1 整併後）
... (其他不變)
```

### 摘要 4 卡片內容

| 卡片 | 主要值 | 副值 |
|---|---|---|
| 規則評分 | `score` 取一位小數，0–10 大字 | 「警示 X / 可評估 Y / 資料不足 Z」 |
| 估值風險 | P/E、P/B 兩個值並列 | 殖利率 % |
| 成長動能 | 月營收 12M TTM YoY %（Item 2 算出來的） | EPS TTM 同比 % |
| 走勢風險 | 收盤價 + 漲跌 % | 1M / 3M 表現 % |

只顯示**當期分數**，不顯示六期（user 確認）。

### Implementation

新模組 [`js/modules/stock_summary.js`](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/modules/stock_summary.js)：

```js
export function renderStockSummary({ profile, quotes, sales, income, bs, dividend, ruleScore }) {
  // 4 個 .info-card 在 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4
  // 規則評分卡用 .info-card .score-card-large 大字
  // 其他三卡用既有 .info-card pattern（沿用 institutional.js 的 .card-label / .card-value）
}
```

`main.js` 在資料 fetch 完、rule alerts 計算後呼叫：

```js
renderStockSummary({
  profile: data.profile?.data,
  quotes: data.quotes?.data,
  sales: data.sales?.data,
  income: data.income?.data,
  bs: data.bs?.data,
  dividend: data.dividend?.data,
  ruleScore: computeBuyScore(ruleResult.latestAvailableCount, ruleResult.latestAlertCount),
});
```

### Files to modify

| 檔案 | 改動 |
|---|---|
| `index.html` | (a) 把 `<div id="rule-alerts-container">` 從 `<section id="section-profile">` 拉出，包進新 `<section id="section-rule-alerts">`，放 K 線圖之後；(b) 新增 `<section id="section-stock-summary">` 在 K 線圖和規則警示之間 |
| `js/modules/stock_summary.js` | 新檔，export `renderStockSummary` |
| `js/main.js` | (a) Loading state 加入 `stock-summary-content`、`section-rule-alerts`；(b) 加 import + render 呼叫；(c) `retryOptions` 對應 |
| `css/style.css` | 新增 `.score-card-large` 用大字（如 `font-size: 2.5rem`）；其他 3 卡沿用既有 `.info-card` |
| `tests/stock_summary.test.js` | 新檔，DOM smoke：渲染 4 卡 + 各卡內容 + escapeHtml |
| `tests/dom_smoke.test.js`（若有相關 assertion） | 確認 rule alerts 在新位置 |

### 風險

- `rule-alerts-container` 移出 profile 涉及 main.js 多處重新接線：loading state（main.js:208–210 附近的 `buildLoadingMarkup`）、retryOptions、showError 路徑。Audit 全部 reference。
- 既有 [`tests/rule_alerts.test.js`](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/tests/rule_alerts.test.js) 是用容器 ID `rule-alerts-container` 渲染——只要容器 ID 不變，測試應該不會失敗。但若 wrapper section 結構變了，section-level 測試可能要更新。

---

## Files to modify（總覽）

全部位於 `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/`：

| 檔案 | 改動 | 涉及項目 |
|---|---|---|
| `index.html` | 移除 income section、調整月營收 grid、移動三大法人 cards、移出 rule alerts、新增 stock summary | 1, 3, 6 |
| `js/main.js` | 移除 income 呼叫、整合 stock summary、整合 K 線評分疊加、loading state 對應新 section | 1, 5, 6 |
| `js/api.js` | `fetchMonthSales` page_size 12 → 24 | 2 |
| `js/modules/valuation.js` | 重寫為 7 欄整併表 | 1 |
| `js/modules/income.js` | 廢除 / deprecated | 1 |
| `js/modules/revenue.js` | 加 3M Rolling 與 12M TTM 兩欄 | 2 |
| `js/modules/institutional.js` | 顛倒 cards/table 渲染順序 | 3 |
| `js/lib/rule_engine.js` | 新增 `computeBuyScore` + `computePeriodScores` | 4, 5 |
| `js/charts/kline.js` | 加 score overlay series + `setRuleScoreOverlay` export | 5 |
| `js/modules/stock_summary.js` | 新檔 | 6 |
| `css/style.css` | 加 `.score-card-large`、調整三大法人 cards 間距 | 3, 6 |
| `tests/valuation.test.js` | 重寫對應 7 欄 | 1 |
| `tests/income.test.js` | 標 deprecated 或刪除 | 1 |
| `tests/revenue.test.js` | 補新 YoY 測試 | 2 |
| `tests/rule_engine.test.js` | 加 `computeBuyScore` + `computePeriodScores` 測試 | 4, 5 |
| `tests/kline.test.js` | 加 score overlay 測試 | 5 |
| `tests/stock_summary.test.js` | 新檔 | 6 |
| `tests/institutional.test.js`（若無則跳過） | DOM order 對應 | 3 |

`scorecard_web.json` 不動。

---

## Risks（合併重要風險）

| # | 風險 | 緩解 |
|---|---|---|
| A | Item 1：移除 income section 後月營收 grid 變獨佔，視覺空洞 | 把月營收 row 改成 `lg:grid-cols-1` 或保留 grid 等待右欄補新內容（後續 task） |
| B | Item 2：page_size 24 對其他 consumer 無影響但要 audit | rule_engine 用前 8 月、revenue 顯示前 12 月、其他 module 不消費 sales。實測後加 mock fetch 鎖 page_size=24 |
| C | Item 4：「通過」語意倒轉、NA-fair 公式須溝通清楚 | plan 內已明確說明；UI 上同時顯示分數 + 「警示 X / 可評估 Y / 資料不足 Z」三元組 |
| D | Item 5：6 期評分在 5Y 範圍視覺擠壓 | v1 接受；建議手動把 K 線預設改 1Y；v2 backlog 擴充歷史 |
| E | Item 6：rule alerts 移出 profile 涉及多處接線 | grep `rule-alerts-container`、`section-profile`、`section-rule-alerts` 確認；保留容器 ID 不變讓既有 test 不失敗 |
| F | 標題改名「季度財務」 vs 「估值趨勢」 | 改名語意更貼切；若擔心既有 docs / audit 引用，先 grep 全 repo 確認影響面 |
| G | Item 5 / 6 互相依賴（Item 6 規則評分卡片用 Item 4 公式；K 線疊加用 Item 4 + 5 邏輯） | Implementation sequence 先做 Item 4，再做 5 / 6 |

---

## Implementation sequence

由獨立到依賴：

1. **Item 3** — 三大法人順序顛倒（最簡、無依賴）
2. **Item 1** — 估值/損益整併 + 標題改名（基礎結構變動）
3. **Item 4** — `computeBuyScore` 純函數（Item 5 / 6 都依賴）
4. **Item 2** — 月營收 4 種 YoY（獨立可平行）
5. **Item 5** — `computePeriodScores` + K 線疊加（依賴 Item 4）
6. **Item 6** — 股票摘要 + 區塊位置重排（依賴 Item 4 的 `computeBuyScore`、最好等 Item 5 完成才能交叉驗證）

每階段完成後跑 `npm test` 確保不破壞既有測試。

---

## Verification

### 單元測試

```bash
cd /Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov
npm test
```

所有測試需綠燈，重點：
- `tests/valuation.test.js` 對應 7 欄
- `tests/revenue.test.js` 補的 3M / 12M YoY 計算
- `tests/rule_engine.test.js` 補的 `computeBuyScore` + `computePeriodScores`
- `tests/kline.test.js` 補的 score overlay
- `tests/stock_summary.test.js` 新檔

### E2E 手動驗證

```bash
cd /Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov
python3 -m http.server 8000
# 開 http://localhost:8000
```

依序測：
1. 輸入 `2330`（資料完整）：
   - 季度財務區塊出現 7 欄、季度損益區塊消失
   - 月營收區塊出現 4 種 YoY 欄位（最舊 1–2 row 12M TTM 顯示 `—`）
   - 三大法人區塊：cards 在上、table 在下
   - K 線圖出現 amber 評分曲線（右軸 0–10）
   - K 線下方出現「股票摘要」區塊（4 張 info-card）
   - 「即時規則警示」區塊位於摘要之後（非 profile 內）
2. 輸入冷門小股：摘要卡片可能某些指標 `—`、規則評分顯示「資料不足」
3. K 線圖切換 3M / 6M / 1Y / 3Y / 5Y：評分線在不同範圍正確顯示或部分隱藏
4. 切換深色背景：amber 評分線對比清楚
5. 含 XSS payload 測試：摘要卡片 escape 正常

### 回歸驗證

- 確認 `scorecard_web.json` 沒有變更
- 其他區塊（策略買入分數、股利、現金流等）顯示一致
- `tests/strategy_snapshot_contract.test.js` 繼續綠燈

---

## Critical Files Reference

絕對路徑為主，定位以**函式 / 區塊名稱為主、line number 為輔**：

| 檔案 | 主要符號 / 區塊 | 大致位置 |
|---|---|---|
| `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/index.html` | `<section id="section-profile">`、`<section id="section-kline">`、`<section id="section-valuation">`、`<section id="section-income">`、`<section id="section-institutional">` | 全檔結構，重點 line 60–200 |
| `js/main.js` | render 呼叫鏈：`renderProfile`、`computeRuleAlerts` + `renderRuleAlerts`、`renderKline`、`renderStrategyScores`、`renderValuation`、`renderIncome`、`renderRevenue`、`renderInstitutional` | 約 line 297–470 |
| `js/api.js` | `fetchMonthSales`（page_size 12 → 24）、`fetchQuarterlyIncome`、`fetchQuarterlyBS`、`fetchDailyQuotes` | line 53–230 範圍 |
| `js/modules/valuation.js` | `renderValuation(income, bs)` 重寫 | 全檔 |
| `js/modules/income.js` | `renderIncome(income)`（廢除） | 全檔 |
| `js/modules/revenue.js` | `renderRevenue(data)` 加 3M / 12M | 全檔 |
| `js/modules/institutional.js` | `renderInstitutional`、`renderSummaryCards` | 全檔 |
| `js/modules/stock_summary.js` | 新檔，`renderStockSummary({...})` | — |
| `js/lib/rule_engine.js` | 新增 `computeBuyScore`、`computePeriodScores` | append at end |
| `js/charts/kline.js` | `renderKline`、新增 `setRuleScoreOverlay` | 全檔 |
| `css/style.css` | 新增 `.score-card-large`；既有 `.info-card`、`.metric-card`、`.strategy-scores-table` 沿用 | 全檔 |
| `js/utils.js` | 共用 `formatNumber`、`formatPercent`、`valClass`、`signStr`、`escapeHtml`、`showError`、`showNotApplicable` | 全檔 |
