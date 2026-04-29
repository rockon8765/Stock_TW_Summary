# 即時規則警示「近 6 期表格化」改造規劃

## Context

目前在 `feature/layout-claude` 分支（worktree: `.claude/worktrees/eager-liskov/`）的「即時規則警示（Live API 近似訊號）」區塊，是把 7 條 sell rules（S10/S11/S12/S13/S17/S20/S22）渲染成一排 chip，每個 chip 只顯示「當前個股是否觸發此條件」（單一 boolean）。

長官希望同時看到**過去六期**（含當前 + 過去五期）的觸發狀況，因此要把這個區塊從一排 chip 改成一張表格：

- **row** = 7 條規則
- **column** = 過去 6 期（由舊到新；最右邊為當前期）

7 條規則的資料頻率不同（月、季、日），表格設計必須容忍每個 row 有不同頻率的時間軸。

最終目的：協助分析時直接看到「過去 6 期內該股有幾期觸發此規則」，而非只看當前一期。

## Plan revision log

Rev 4 修訂（針對實作後 reviewer 回饋）：
- `latestAvailableCount` 描述補上 `r.latest != null` 顯式檢查，避免複製片段時把 missing latest 誤算成可用（已和 [`rule_engine.js` 中 `computeRuleAlerts` 末段](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/lib/rule_engine.js) 實作對齊）。
- `th[scope="row"]` 的 `white-space` 從 `nowrap` 改為 `normal`，符合長中文規則名稱換行需求；和實作中 `.rule-alerts-table th[scope="row"]` 規則對齊。手機版隱藏 `.rule-name` 的策略保留。
- API 行號參照改為「函式名為主、line number 為輔」，避免 line 漂移：原本指 `js/api.js:43-47` 其實是 `fiveYearsAgo()` helper，不是 `fetchDailyQuotes` / `fetchDailyStatistics`；現以函式名作為連結文字，line number 註明「實作時請以函式名定位」。

Rev 3 修訂：
- 「七條規則的頻率」表格 S17 row 的 lookback 描述對齊本文契約（已載入視窗 ≥ 250 筆 valid PB；精準 5Y trailing 列 backlog）。
- Critical Files Reference 的「絕對路徑」理由不再假設 plan 檔位置，改寫為「避免 plan 檔搬位置時連結失效」。

Rev 2 修訂（針對 reviewer 回饋）：
1. 明確化「`rules[].triggered`（top-level alias）始終為 boolean」 vs 「`periods[i].triggered` / `latest.triggered` 三態（可為 `null`）」的契約區隔。
2. S13 YTD 邏輯加上明確的 `quarter <= anchorQuarter` 過濾規則，並補對應測試。
3. S17 trailing window 限制（API 是今天往前 5Y）寫清楚，預設採「已載入視窗 ≥ 250 筆」近似法；把「精準 5Y trailing」列為可選 backlog（要動 `fetchDailyQuotes` start）。
4. 加入「當月未結束時，日頻最右欄 cutoff = 當月最新可得交易日，需在 tooltip 顯示真實 cutoff 日期」的契約。
5. Summary 訊息改為「本期警示 X/Y，資料不足 Z」三元組；`computeRuleAlerts` 回傳新增 `latestAvailableCount` / `latestNaCount`。
6. CSS 結構改成「外層 `.rule-alerts-table-scroll` 包 `<table>`」+「`th` 內放 `.rule-row-header` 子元素 flex」，table 保持 table layout；renderer 一律 `escapeHtml` 所有外部來源字串。
7. Critical Files Reference 路徑全改為絕對路徑。
8. 新增 `tests/api.test.js` 的 mock fetch 測試鎖 `fetchQuarterlyIncome page_size=14`。
9. 新增 `computeRuleAlerts({})` 仍回 7 rules × 6 naCell 的契約與測試。

## Locked-in decisions（已和使用者確認）

| 決策點 | 決議 |
|---|---|
| 目標分支 | **feature/layout-claude**（worktree: `.claude/worktrees/eager-liskov/`）。當前的 nostalgic-raman 分支不動。 |
| 日頻規則（S17、S22）的「一期」定義 | **月末交易日 × 6**。讓所有 row 的時間軸大致對齊在月度，視覺較整齊；日頻變化大時也較有意義。 |
| 季資料抓取深度 | 把 `fetchQuarterlyIncome` 的 `page_size` 從 8 提升到 **14**，以涵蓋 6 期 × YOY 所需的 11Q 回溯，再加 3Q margin。 |

## 七條規則的頻率（修改後）

| Code | 規則 | 一期 = | 一期判斷需要的 lookback |
|---|---|---|---|
| S10 | 累積營收連續三個月 YOY 衰退 10% | 1 月 | 3 個月（anchor + 2 個月） |
| S11 | 連續兩季稅後淨利 YOY 衰退 5% | 1 季 | 6 季（anchor、前一季，各自 vs 4 季前） |
| S12 | 連續兩季營業利益 YOY 衰退 5% | 1 季 | 同 S11 |
| S13 | 今年以來稅後獲利衰退 YOY 達 10% | 1 季 (YTD) | 同年累計 + 去年同期累計（最深約 8 季） |
| S17 | PB 百分位 > 80% | 1 個月末交易日 | 已載入視窗截至 cutoff，valid PB ≥ 250；精準 5Y trailing 為 backlog |
| S20 | 單月營收年增率連兩月衰退 | 1 月 | 2 個月 |
| S22 | 跌破年線 AND Alpha250D < -10% | 1 個月末交易日 | 該日期前 250 個交易日 + 對應 stats |

對「過去 6 期」最遠 anchor，所需資料量：
- 月頻（S10、S20）：8 個月（API 已給 12，OK）
- 季頻（S11、S12）：11 季（API 升到 14 後，OK，含 3Q 緩衝）
- 季頻 YTD（S13）：~13 季（API 14 季勉強夠，最舊 1 期偶爾會 N/A，可接受）
- 日頻 month-end（S17、S22）：[`fetchDailyQuotes`](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/api.js) 與 [`fetchDailyStatistics`](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/api.js) 都呼叫 `fiveYearsAgo()` 當 `start`（即「今天往前 5Y」）。最舊 cutoff（~5 個月前）若要套完整 trailing 5Y 視窗，理論上需要回溯到 ~5.5Y 前。本 plan 採近似：用「已載入視窗截至 cutoff，要求 ≥ 250 筆有效資料」即 OK，不足才 fallback `naCell`。若日後要精準，可改 `fiveYearsAgo()` helper 或讓兩個 fetcher 把 `start` 改成「今天往前 5.5Y」。

## Files to modify

全部位於 `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/`：

| 檔案 | 改動 |
|---|---|
| `js/lib/rule_engine.js` | 重寫：每個 `checkSxx` 由回傳 `boolean` 改為回傳長度 6 的 cells 陣列；`computeRuleAlerts` 聚合輸出新 shape。 |
| `js/modules/rule_alerts.js` | 把 chip row HTML 改成 `<table class="rule-alerts-table">`，每個 row 自己的 6 個 cell 各帶期數標籤。 |
| `js/api.js` | `fetchQuarterlyIncome` 的 `page_size: 8` → `14`（line 93）。 |
| `js/modules/valuation.js` | 防禦式 `.slice(0, 8)`：避免季資料變多後估值表的 row 數跟著變。 |
| `js/modules/income.js` | 同上：保持原本 8 季顯示量。 |
| `css/style.css` | 在現有 `/* === Rule alerts === */` 區塊（line 287–365）後新增 `.rule-alerts-table` 樣式；舊 `.chip*` 規則保留並標 deprecated。 |
| `tests/rule_engine.test.js` | 更新所有既有 assertion 至新 shape；新增 periods 長度、oldest-first 順序、N/A cell、S13 anchor 過濾、空輸入仍回 6 naCell 等測試。 |
| `tests/api.test.js` | 新增 mock fetch 測試鎖 `fetchQuarterlyIncome` 的 `page_size=14`（reviewer 補強建議）。 |
| `tests/rule_alerts.test.js`（新檔） | DOM smoke test：渲染 7 row × 6 cell 的表格、N/A cell 顯示 `—`、空輸入優雅退化。 |

`index.html`（line 67–70 的 `#rule-alerts-container`）和 `js/main.js`（line 320–335 的呼叫點）**不動**——容器 ID、export 函式名和呼叫簽名都保持一致。

## 1. 新的資料模型（`computeRuleAlerts` 回傳 shape）

```js
{
  rules: [
    {
      code: "S10",
      name: "累積營收連續三個月YOY衰退10%",
      frequency: "monthly",     // "monthly" | "quarterly" | "monthEndDaily"
      detail: "",               // rule-level note，給 row header tooltip
      periods: [                // 長度恆為 6，oldest-first（[0]=最舊，[5]=最新）
        { label: "2024-10", triggered: false, detail: "−8.4%, −12.1%, −13.0%" },
        { label: "2024-11", triggered: true,  detail: "−12.0%, −11.5%, −10.9%" },
        // ...
        { label: "2025-03", triggered: true,  detail: "−13.2%, −12.7%, −11.4%" },
      ],
      latest: { /* alias to periods[5] */ },
      triggered: true,          // 派生 alias：(periods[5]?.triggered === true)；嚴格 boolean，永不為 null
    },
    // ...
  ],
  alertCount: 2,              // 當前期觸發數（= rules.filter(r => r.triggered).length），向後相容 alias
  latestAlertCount: 2,        // 同 alertCount 的明確命名
  latestAvailableCount: 5,    // latest.triggered !== null 的規則數（即 latest 期能算出 true/false 的）
  latestNaCount: 2,           // latest.triggered === null 的規則數，總和 = 7
}
```

**Cell 三態**（`periods[i].triggered` 和 `latest.triggered`）：
- `true` → 觸發（紅色 ●）
- `false` → 未觸發（灰色 ○）
- `null` → 該期 lookback 資料不足（淺灰 `—`，tooltip 顯示「資料不足」）

**`rules[].triggered`（top-level）契約**：
- 始終為 boolean：`triggered = (latest?.triggered === true)`。
- 等價於 `!!periods[5]?.triggered`，`null`/`undefined`/`false` 全部 coerce 成 `false`。
- 純粹是向後相容 alias，給舊呼叫者用。**只能是 `true`/`false`，不會是 `null`。**
- **Cell 級別才有三態**——renderer 在每個 `<td>` 判斷狀態時必須讀 `periods[i].triggered`，不能讀 top-level `triggered`。

**重要不變式**：
- `periods.length` 恆為 6（即使全部沒資料，也要 push 6 個 naCell）。
- `periods[0]` 最舊、`periods[5]` 最新。
- 7 條規則的順序維持現有：S10、S11、S12、S13、S20、S22、S17（與既有測試一致）。
- `computeRuleAlerts({})` / `computeRuleAlerts({monthsales: null, ...})` 仍須回傳 7 條 rule，每條 `periods.length === 6`，所有 cell 為 `naCell` shape。

**新增聚合欄位**（解決 reviewer 點 5）：
- `latestAvailableCount`：`rules.filter(r => r.latest != null && r.latest.triggered !== null).length`。**兩個檢查都要**：`r.latest != null` 排除 `latest` 本身就是 `null`/`undefined` 的情況（雖目前 aggregator 保證 `periods[5]` 存在，但日後若 `padOldestFirst` 行為改動仍要 robust），`r.latest.triggered !== null` 排除 cell 本身為 N/A。寫成 optional chaining `r.latest?.triggered !== null` 會把 missing latest 誤算成可用（因為 `undefined !== null` 為 true），所以必須顯式檢查。實作參照：`computeRuleAlerts` 主體 filter 寫法。
- `latestNaCount`：`totalRules - latestAvailableCount`。
- `alertCount` / `latestAlertCount` 維持原語意：latest 期 `triggered === true` 的規則數。

## 2. 每條規則的轉換邏輯

統一加在 `rule_engine.js` 頂部的 helpers：

```js
function formatYM(yyyymm) { /* "202503" → "2025-03" */ }
function formatYQ(yyyyq)  { /* "202504" → "2025Q4" */ }
function monthEndRows(quotes, dateKey="日期") {
  // 回傳每個月的最後一個交易日 row，{label:"YYYY-MM", row}[]，asc by label
}
function naCell(label, reason="資料不足") {
  return { label, triggered: null, detail: reason };
}
function computeYoy(cur, prev) {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}
```

**S10**（monthly）：sort desc by `年月`，對 `i = 0..5` 取 anchor `sorted[i]`，檢查 `sorted[i], sorted[i+1], sorted[i+2]` 的 `累計合併營收成長` 是否都 `< -10`。out 用 `out[5 - i]` 寫入確保 oldest-first。

**S11 / S12**（quarterly）：抽出共用 `checkQuarterlyYOYDeclineSeries(incomeQ, field, threshold)`，對 `i = 0..5` 的 anchor `sorted[i]`，分別計算當季 YOY（`sorted[i]` vs `sorted[i+4]`）和前季 YOY（`sorted[i+1]` vs `sorted[i+5]`），兩者都 `< threshold` 才 triggered。最深引用 `sorted[10]`。

**S13**（quarterly YTD）：每個 anchor 取其年份 Y 和該季季數 q（1..4）。明確過濾規則：
- `ytdCur` = `incomeQ` 中所有 `年份 == Y AND 季數 <= q` 的 `稅後純益` 加總。
- `ytdPrev` = `incomeQ` 中所有 `年份 == Y-1 AND 季數 <= q` 的 `稅後純益` 加總。
- **`年份 == Y AND 季數 > q` 的資料（即 anchor 之後的同年季度）絕對不可納入 ytdCur**——例：anchor 是 Y Q3、資料中已有 Y Q4，Y Q4 不得算進 ytdCur，否則會把未來季度資料洩漏到 historical 期判斷。
- YOY = `(ytdCur - ytdPrev) / |ytdPrev| * 100`，`< -10` 即 triggered。
- 若 ytdPrev == 0 或無對應資料 → `naCell`。

**S17**（month-end-daily）：用 `monthEndRows(quotes)` 取最近 6 個月末，對每個月末的 cutoff 日：
- **採「使用已載入視窗」近似法**：用 `quotes.filter(d <= cutoff)` 形成可得區間。注意 API 是「今天往前 5Y」，最舊 cutoff（~5 個月前）的視窗實際上只有 ~4.5Y trailing，並非完整 5Y。
- 計算當日 PB 在視窗中的百分位 > 0.8 即 triggered。
- 視窗中 valid PB（`> 0` 且 `Number.isFinite`）< 250 → `naCell(label, "歷史 PB 樣本不足")`。
- **若要精準 trailing 5Y**，後續可把 `fetchDailyQuotes` 的 `start` 改成「今天往前 5.5Y」（多抓 6 個月），本 plan 列為可選 backlog，預設不動 API。

**S20**（monthly）：sort desc，對 `i = 0..5` 檢查 `sorted[i], sorted[i+1]` 的 `單月合併營收年成長` 是否都 `< 0`。

**S22**（month-end-daily）：用 `monthEndRows(quotes)` 取最近 6 個月末。每個 cutoff：
- 從 quotes asc 取 `日期 <= cutoff` 的最後 250 筆收盤價計算 250MA。
- 找 stats 對應日（先精確比對 `日期 == cutoff`，再 fallback 到最後一筆 `日期 <= cutoff`）。
- `close < MA250 AND Alpha250D < -0.1` → triggered。
- 250 筆湊不齊或 stats fallback 也找不到 → naCell。

### 「當前期」對日頻規則的特殊性

- 月頻 / 季頻 row 的最右欄 label 是已結束的時間單位（例：`2025-03`、`2025Q1`）。
- 日頻（S17、S22）的最右欄 cutoff **不一定是真正月末**：若 anchor 月份還沒結束，cutoff = 該月最新可得交易日。例：今天 2026-04-29、最新 daily row `2026-04-28`，那「2026-04」這格的 cutoff 就是 `2026-04-28`（不是 `2026-04-30`）。
- `monthEndRows()` 的契約：對每個月份取「該月份內最後一筆 `日期`」即可——不論該月份是否已結束。函數本身不需特殊處理「進行中」的月份，但 renderer 需要把 cutoff 日期暴露在 tooltip。
- **Cell label 與 tooltip 的差異**：
  - `period.label` 仍顯示 `2026-04`（保持與其他月頻 row 視覺一致）。
  - `period.detail` 必須帶 cutoff 日期，例如 `"cutoff 2026-04-28; PB 2.31, 5Y 百分位 84%"`。
  - tooltip 拼接：`${label} · ${detail}` → `2026-04 · cutoff 2026-04-28; PB 2.31, 5Y 百分位 84%`。
- 為了讓 month-end 邏輯一致，把實際 cutoff 日期寫進 `period.detail` 字首是**強制契約**——`checkS17` / `checkS22` 都要遵守。

**`computeRuleAlerts` 主體**：

```js
export function computeRuleAlerts({ monthsales, incomeQ, quotes, stats }) {
  const rules = [
    { code: "S10", name: "累積營收連續三個月YOY衰退10%",     frequency: "monthly",       detail: "", periods: checkS10(monthsales) },
    { code: "S11", name: "連續兩季單季稅後淨利YOY衰退5%",    frequency: "quarterly",     detail: "", periods: checkS11(incomeQ) },
    { code: "S12", name: "連續兩季單季營業利益YOY衰退5%",    frequency: "quarterly",     detail: "", periods: checkS12(incomeQ) },
    { code: "S13", name: "今年以來稅後獲利衰退YOY達10%",     frequency: "quarterly",     detail: "", periods: checkS13(incomeQ) },
    { code: "S20", name: "單月營收年增率連兩月衰退",          frequency: "monthly",       detail: "Live API 直接檢查最近 2 個月的單月營收年增率，不是 ScoreCard 的季資料規則。", periods: checkS20(monthsales) },
    { code: "S22", name: "跌破年線且 Alpha250D < -10%（即時近似）", frequency: "monthEndDaily", detail: "Live API 以 Alpha250D 近似 ScoreCard 的「與大盤比年報酬率」訊號，前端與快照可能不同步。", periods: checkS22(quotes, stats) },
    { code: "S17", name: "PB百分位大於80%",                  frequency: "monthEndDaily", detail: "", periods: checkS17(quotes) },
  ].map(r => ({ ...r, latest: r.periods[5] ?? null, triggered: r.periods[5]?.triggered === true }));

  const latestAlertCount = rules.filter(r => r.triggered).length;
  const latestAvailableCount = rules.filter(r => r.latest != null && r.latest.triggered !== null).length;
  const latestNaCount = rules.length - latestAvailableCount;
  return {
    rules,
    alertCount: latestAlertCount,        // 向後相容 alias
    latestAlertCount,
    latestAvailableCount,
    latestNaCount,
  };
}
```

注意 `triggered: r.periods[5]?.triggered === true` 是**嚴格 boolean**——`null` / `undefined` / `false` 都會回 `false`，永遠不會回 `null`。這保證 top-level alias 始終是 boolean，符合 reviewer 點 1 的契約。

## 3. 表格渲染設計（`rule_alerts.js`）

### 設計取捨：採「per-row 自帶期數標籤」，不用統一 thead

季規則 row 的標籤是 `2024Q1..2025Q2`，月規則 row 的標籤是 `2024-10..2025-03`，硬塞同一個 thead 會誤導讀者。最乾淨的方式是：**每個 cell 自己上方放小字期數標籤**，整個表不出 thead。

### Row 樣板

```
| [S11] 連續兩季稅後淨利YOY衰退5% [季] | 24Q1 | 24Q2 | 24Q3 | 24Q4 | 25Q1 | 25Q2 |
                                       ○      ○      ○      ●      ●      ●
```

- col 1（sticky）：`<th scope="row">` 內含 `<span class="rule-code">`、`<span class="rule-name">`、`<span class="rule-cat-badge">月|季|日(月末)</span>`
- col 2–7：`<td>`，每個 cell 內 `<div class="cell"><div class="cell-label">{label}</div><div class="dot dot-on|dot-off|dot-na">●|○|—</div></div>`
- 整列 hover 高亮，奇偶 row 交錯背景。

### 摘要列（區分觸發 / 可得 / 資料不足）

```
即時規則警示（Live API 近似訊號 · 近 6 期）         本期警示 2/5，資料不足 2
部分規則為前端即時近似訊號，可能與 ScoreCard 快照不同。資料不足以計算的儲存格顯示 —。
```

顯示規則：
- 主要數字：`本期警示 {latestAlertCount}/{latestAvailableCount}`（分母是 latest 期能算出 true/false 的規則數，不是 7）。
- 若 `latestNaCount > 0` 才追加 `，資料不足 {latestNaCount}`；否則整段省略以避免雜訊。
- 邊界：`latestAvailableCount === 0`（latest 全 N/A）→ 顯示「即時規則警示資料不足」並隱藏分數。
- `alertCount`（= `latestAlertCount`）的顏色等級維持現行：0 → `val-neutral`，1–2 → `val-warn`，≥3 → `val-down`。

### Tooltip 與 escaping

每個 `<td>` 上 `title="{label} · {detail}"`，例如 `2025-03 · -13.2%, -12.7%, -11.4%`，或日頻 row 的 `2026-04 · cutoff 2026-04-28; PB 2.31, 5Y 百分位 84%`。row header 上 `title={rule.detail}`（若有）。

**Escaping 契約**（與 reviewer 點 6 對齊，沿用現有 [js/modules/rule_alerts.js:42](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/modules/rule_alerts.js) 的習慣）：所有外部來源字串進入 HTML 字串模板前都必須經 `escapeHtml`：
- `rule.code`、`rule.name`、`rule.detail`
- `period.label`、`period.detail`
- 凡是進 `title="..."` 的拼接字串都要 escape 後再放。

`escapeHtml` 已存在於 `js/utils.js`，直接 `import`。

### 空輸入處理

`ruleResult` 為 null 或 `rules` 不是陣列 → 維持原本「即時規則警示資料不足（Live API 資料量不夠計算）」訊息。

## 4. HTML 結構與 CSS 變更（`rule_alerts.js` + `css/style.css`）

### HTML 結構（針對 reviewer 點 6 修正）

不要把 `<table>` 設成 `display: block`，也不要把 `<th scope="row">` 直接設成 `display: flex`。改採「scroll wrapper + 內層 row-header 元素」結構：

```html
<div class="rule-alerts">
  <div class="rule-alerts-header">
    <span class="rule-alerts-title">即時規則警示（Live API 近似訊號 · 近 6 期）</span>
    <span class="rule-alerts-summary">…</span>
  </div>
  <div class="rule-alerts-summary">…說明文字…</div>
  <div class="rule-alerts-table-scroll">
    <table class="rule-alerts-table">
      <tbody>
        <tr>
          <th scope="row">
            <div class="rule-row-header">
              <span class="rule-code">S11</span>
              <span class="rule-name">連續兩季稅後淨利YOY衰退5%</span>
              <span class="rule-cat-badge">季</span>
            </div>
          </th>
          <td title="…"><div class="cell"><div class="cell-label">…</div><div class="dot dot-…">…</div></div></td>
          ...（× 6）
        </tr>
        ...（× 7）
      </tbody>
    </table>
  </div>
</div>
```

### CSS（追加在現有 rule alerts 樣式區，line 287–365 之後）

- **Scroll wrapper**：`.rule-alerts-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }`。
- **Table**：`.rule-alerts-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }`——保持 table layout，**不要** `display: block`。
- **`th[scope="row"]`**：`position: sticky; left: 0; background: var(--color-surface-800); text-align: left; padding: 0.5rem 0.75rem; white-space: normal; vertical-align: middle;` 並設 `min-width: 13rem; max-width: 20rem;` 限制寬度。**`white-space: normal`**（不是 `nowrap`）——讓長中文規則名稱在 sticky 欄內自動換行，避免單一 row 撐爆 sticky 欄寬度。手機版的 `.rule-name { display: none; }` 策略仍保留，作為極窄寬時的進一步退路。
- **`.rule-row-header`**（`th` 內層 div）：`display: flex; flex-wrap: wrap; gap: 0.25rem 0.5rem; align-items: center;`——code/name/badge 在這層才用 flex。
- **`td`**：`text-align: center; min-width: 4.5rem; vertical-align: middle; padding: 0.375rem 0.25rem;`。
- **`.cell`**：`display: flex; flex-direction: column; align-items: center; gap: 0.125rem;`。
- **`.cell-label`**：`font-size: 0.625rem; color: var(--color-text-subtle);`。
- **`.dot`**：`font-size: 0.875rem; line-height: 1;`。
  - `.dot-on { color: var(--color-error); }`（紅；與既有 `.chip-triggered` 的紅一致，但用 `error` token 而非 `up` 避免語意混淆）。
  - `.dot-off { color: var(--color-text-subtle); }`。
  - `.dot-na { color: var(--color-text-subtle); opacity: 0.5; }`。
- **奇偶 row 交錯**：`tr:nth-child(even) { background: rgba(51, 65, 85, 0.12); }`，並對應蓋住 sticky `th` 的背景，避免穿透。
- **窄螢幕**：`@media (max-width: 640px)`：scroll wrapper 已經處理橫向捲動，table 不需要動；可選擇 `.rule-name { display: none; }` 隱藏全名只留 code 節省寬度。

舊的 `.chip` / `.chip-off` / `.chip-triggered` / `.rule-chips` 規則**保留**並加 `/* deprecated: chip layout, kept temporarily */` 註解，下個 release 再移除。

## 5. API 改動（`js/api.js`）與 downstream 影響

**單行修改** at line 93：

```js
export function fetchQuarterlyIncome(ticker, signal) {
  return queryTable("md_cm_fi_is_quarterly", { ticker, page_size: 14 }, signal);
}
```

`data.income.data` 的所有 consumer（重點審查）：

- `js/main.js:287` `updateExportPayload` — payload shape 不變，下游 export 多拿到 row，影響中性。
- `js/main.js:304` `renderProfile` — 取 most-recent 少數 row，無影響。
- `js/main.js:339` `renderValuation(income, bs)` — 會渲染更多 row，**這是可見的行為改變**。Mitigation：在 `js/modules/valuation.js` sortDesc 後加 `.slice(0, 8)`。
- `js/modules/income.js renderIncome` — 同上加 `.slice(0, 8)` 保持原本 8 季顯示量。
- `js/modules/financial_ratios.js:67` — top-N 用法，更多 row 無害。
- `js/modules/long_term_trend.js` — 用 `annualIs`，與 quarterly 無關。

`tests/api.test.js` 既有沒針對 quarterly 的 page_size assertion，但**為了鎖住這次改造的核心資料深度**，新增一個 mock fetch 測試（見下方第 6 節「新增 `tests/api.test.js` 鎖測」）。

## 6. 測試計畫

### 更新 `tests/rule_engine.test.js`

- 既有 `"computeRuleAlerts returns all seven live rule codes"`（line 26–33）：保留 7 個 code 順序 assertion，新增 `result.rules.forEach(r => { assert.equal(r.periods.length, 6); assert.equal(typeof r.frequency, "string"); })`。
- 觸發測試（line 45–105 各規則）：
  - 將測試輸入資料量擴大到能撐起最新一期判斷（S10 給 ≥ 8 月、S11/12/13 給 ≥ 11Q、S17/22 給足夠歷史）。
  - assertion 從 `states.S10` 改成 `rules.find(r => r.code === "S10").latest.triggered`，並至少多 assert 一個歷史期。
- `"rules stay off when data is insufficient"`（line 107–125）：
  - **`periods[i].triggered` 和 `latest.triggered` 預期值從 `false` 改為 `null`**（資料不足應走 N/A 路徑，是更精確的契約）。
  - **`rules[].triggered`（top-level alias）仍預期為 `false`**（boolean，因為 `latest.triggered === true` 為 false → top-level coerce 成 false）。
  - 既有 `[code, triggered]` pair assertion 仍可繼續用，新增 cell-level assertion 驗證 `null`。

### 新增測試（同檔）

```js
test("monthly rules return 6 oldest-first periods with month labels", ...);
test("quarterly oldest period naCell when lookback insufficient", ...);
test("S13 YTD must not include same-year quarters after the anchor", () => {
  // 例：給 11Q 含 currentYear Q4 的 incomeQ，anchor 是 currentYear Q3。
  // 驗證 currentYear Q4 的 稅後純益 NOT 被算進 ytdCur；只用 Q1+Q2+Q3 對 prevYear Q1+Q2+Q3 比。
});
test("S17 month-end snapshot uses end-of-month trading day", ...);
test("S17 latest period for in-progress month uses last available trading day, not month-end", () => {
  // 給「今天 2026-04-29、最新 row 2026-04-28」型態的 quotes。
  // 驗證 periods[5].label === "2026-04"；periods[5].detail 字首含 "cutoff 2026-04-28"。
});
test("S22 falls back to most recent stats row when month-end exact date is missing", ...);
test("alertCount reflects only latest period triggered count", ...);
test("computeRuleAlerts({}) returns 7 rules each with 6 naCell periods", () => {
  // 完全空輸入，每條 rule.periods.length === 6，所有 periods[i].triggered === null。
  // alertCount === 0、latestAvailableCount === 0、latestNaCount === 7。
  // rules[].triggered 全為 false（boolean，不是 null）。
});
test("latestAvailableCount and latestNaCount partition the 7 rules", () => {
  // 構造混合輸入，部分 rule 算出 latest（true/false），其他 latest 為 null。
  // 驗證 latestAvailableCount + latestNaCount === 7、且 latestAlertCount <= latestAvailableCount。
});
```

### 新增 `tests/api.test.js` 鎖測（reviewer 補強建議）

新增 mock fetch 測試鎖住 `fetchQuarterlyIncome` 帶 `page_size=14`，避免未來不慎改回 8：

```js
test("fetchQuarterlyIncome requests page_size=14 (locked depth for 6-period rule alerts)", async () => {
  // 攔截 global.fetch / queryTable，斷 url.searchParams.get("page_size") === "14"。
});
```

這個測試是這次改造的資料深度核心，值得單獨鎖。

### 新增 `tests/rule_alerts.test.js`

仿 `tests/income.test.js:5–19` 的 `withMockElement` 模式：

```js
test("renderRuleAlerts produces a table with 7 rows and 6 dot cells per row", ...);
test("renderRuleAlerts shows — for null-triggered cells", ...);
test("renderRuleAlerts handles empty/null ruleResult gracefully", ...);
```

跑法：`npm test`（已在 `package.json:6` 設定為 `node --test`）。

## 7. 風險與緩解

| 風險 | 緩解 |
|---|---|
| **A. 最舊 1 期 lookback 不足**（特別是 S13 邊界、S17/22 受 5Y 視窗限制） | `naCell` 路徑照顯示 `—` + tooltip「資料不足」；UX 誠實，不假裝有資料。 |
| **B. 向後相容**（其他模組是否吃舊 shape） | 全文搜尋確認只有 `rule_alerts.js` 是 consumer。保留 `rules[].triggered` 作為派生別名（= `periods[5].triggered`）一個 release 緩衝期，避免下游靜默壞掉。 |
| **C. 7×6 表格在窄螢幕擁擠** | `@media (max-width: 640px)` 啟用橫向捲動 + sticky 第一欄；極窄時可選擇隱藏 rule-name 只留 code。 |
| **D. 觸發色語意**（`--color-up` 紅在台股是「漲」） | 用 `var(--color-error)` 給 `.dot-on`，與既有 `.chip-triggered` 同樣是紅但語意更清楚。 |
| **E. 跨 row 的時間軸不對齊**（月 row 的 `2025-03` 和季 row 的 `2025Q1` 在同一 column） | 設計上接受。Per-cell 標籤已誠實表達不同頻率；強行對齊（譬如把月聚合到季）會破壞規則語意，不做。 |
| **F. 季資料增多影響估值表 / 損益季表 row 數** | `valuation.js`、`income.js` 加防禦式 `.slice(0, 8)` 保持顯示量。 |

## Implementation sequence

1. 重寫 `js/lib/rule_engine.js`（helpers + 7 個 checkSxx 改回傳 array + computeRuleAlerts 聚合，含 `latestAvailableCount` / `latestNaCount`）。
2. 更新 `tests/rule_engine.test.js`（既有 assertion 改 `latest.triggered` / cell-level；新增 periods 結構、S13 anchor 過濾、空輸入 6 naCell、in-progress month cutoff、partition count 等測試）。先讓 engine 測試綠燈。
3. `js/api.js` 將 `fetchQuarterlyIncome` 的 `page_size` 改為 14。
4. `tests/api.test.js` 新增 mock fetch 測試鎖 `page_size=14`。
5. `js/modules/valuation.js`、`js/modules/income.js` 加 `.slice(0, 8)` 防禦。
6. 重寫 `js/modules/rule_alerts.js`：scroll wrapper + table layout + `.rule-row-header` 內層 flex；所有外部來源字串走 `escapeHtml`；摘要行採 `本期警示 X/Y，資料不足 Z` 模板。
7. `css/style.css` 追加 `.rule-alerts-table-scroll` / `.rule-alerts-table` / `.rule-row-header` / `.cell` / `.dot-*` 等樣式；舊 `.chip*` 標 deprecated。
8. 新增 `tests/rule_alerts.test.js`（DOM smoke test）。
9. 手動驗證（見下節）。

## Verification

**單元測試**：
```bash
cd /Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov
npm test
```
所有 `tests/rule_engine.test.js`、`tests/rule_alerts.test.js`、以及其他既有測試都需綠燈。

**E2E 手動驗證**（vanilla JS，無 build step）：
```bash
cd /Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov
python3 -m http.server 8000
# 瀏覽器開 http://localhost:8000
```

依序測：
1. 輸入正常股票（如 `2330`）：表格出現 7 row × 6 col；每個 cell 期數標籤正確（月/季/月末日）；hover tooltip 顯示明細；本期警示數字正確（對齊 `periods[5]` triggered 的數量）。
2. 輸入冷門小股或新上市股：應看到部分 row 出現 `—` cell，tooltip 顯示「資料不足」；摘要行顯示「即時規則警示資料不足」（若連 latest period 都算不出來）。
3. 縮窗到 < 640px：表格橫向捲動，sticky 第一欄保持可見。
4. 切換深色背景：`.dot-on` 紅、`.dot-off` 灰、`.dot-na` 半透明灰，對比清楚。
5. 確認其他區塊不受影響：估值趨勢表仍 8 row、單季損益表仍 8 row。

**回歸驗證**：
- 確認 `index.html`、`js/main.js` 沒有變更。
- 確認 `js/modules/financial_ratios.js`、`js/modules/long_term_trend.js`、`js/modules/profile.js` 顯示一致。

## Critical Files Reference

絕對路徑為主（避免 plan 檔搬位置時連結失效）；定位以**函式 / 區塊名稱為主、line number 為輔**（避免 line 漂移誤導）。

| 檔案 | 主要符號 | 大致位置（僅供入口，請以符號搜尋為準） | 備註 |
|---|---|---|---|
| `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/lib/rule_engine.js` | `computeRuleAlerts`、`checkS10..S22`、`naCell` | 全檔 | 規則邏輯核心 |
| `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/modules/rule_alerts.js` | `renderRuleAlerts` | 全檔 | 渲染模組 |
| `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/api.js` | `fetchQuarterlyIncome`、`fetchDailyQuotes`、`fetchDailyStatistics`、`fiveYearsAgo` | 約 line 40–230（請以函式名 grep 定位） | `fetchQuarterlyIncome` page_size 改 14；`fiveYearsAgo` 是日頻 5Y 視窗 helper |
| `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/modules/valuation.js` | `renderValuation` | 全檔 | 加 `.slice(0, 8)` 防禦 |
| `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/modules/income.js` | `renderIncome` | 全檔 | 加 `.slice(0, 8)` 防禦 |
| `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/css/style.css` | `/* === Rule alerts === */` 區塊起 + 新增 `.rule-alerts-table-scroll` / `.rule-alerts-table` 等 | 約 line 287–365（請以註解區塊定位） | 新樣式追加於既有區塊後 |
| `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/main.js` | 規則警示渲染呼叫處（搜 `renderRuleAlerts(` 或 `computeRuleAlerts(`） | 約 line 320–335 | 不動 |
| `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/tests/rule_engine.test.js` | 全檔 | — | 待更新測試 |
| `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/tests/api.test.js` | 新增 `fetchQuarterlyIncome` page_size 鎖測 | — | 新增測試 case |
| `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/tests/rule_alerts.test.js` | 新檔 | — | DOM smoke test |
| `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/utils.js` | `sortAscByKey`、`sortDescByKey`、`escapeHtml` | 全檔 | 共用 helpers |
