# 策略買入分數「類別聚合」改造規劃

## Plan revision log

Rev 3 修訂（針對 reviewer 點評）：
- **`Number.isFinite(Number(score))` 行為描述**更正：原寫「過濾字串型髒資料」不精準。實際上 `Number("0.5") === 0.5`、`Number("") === 0`、`Number("  ") === 0`、`Number(null) === 0`、`Number(true) === 1` 都會通過 `isFinite`；只有 `NaN` / `Infinity` / 非數字字串（如 `"abc"`）會被擋下。文件改寫為「過濾 NaN / Infinity / 純非數字字串；若日後要拒絕空字串 / 空白字串 / boolean 等隱式轉型，需另寫 helper（如 `typeof score === "number" && Number.isFinite(score)` 嚴格版）」。
- **Render-layer 測試 import 路徑**更正：原寫 `import { withMockDocument } from "./helpers.js"`，但 repo 沒有 `tests/helpers.js`，`withMockDocument` 是 [`tests/dom_smoke.test.js:7`](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/tests/dom_smoke.test.js) 的 local helper。改成「render-layer 兩個測試**直接加在 `dom_smoke.test.js` 同檔內**，沿用同檔 `withMockDocument`，不要另立 helpers.js」。

Rev 2 修訂（針對 reviewer 回饋）：
1. **分數範圍**從「0~1」更正為「**−1 到 1**」。實際 `scorecard_web.json` 有 ~0.2% 負分（62/36576 個 score），要正確處理：`Math.round(value*100)` 對負數天然正確（−0.1 → −10），**不**做 clamp；測試補負分案例。
2. **Aggregation 迭代來源**從「只走 `strategiesMeta`」改為「先走 meta，再補 `scoresMap` 中 meta 缺失的名稱（synthetic meta，歸『其他』）」。避免資料不一致時靜默吃掉分數。
3. **Sort 測試**補進 §5：`mean/max/min` 在 asc/desc 下 null 都最後。
4. **兩層職責清楚分離**：純函數 `aggregateByCategory` 必定回傳每個類別的 row（即使全 null）；render 層的 `showNotApplicable` 早退路徑（`Object.keys(scoresMap).length === 0`）保留不動，是另一層。
5. **XSS 測試**：明示 `latest_date` 因新表不顯示已從 render 路徑移除，但測試保留「`latest_date` payload 不應出現在 DOM」反向 assertion；`as_of` 與策略名（透過 tooltip）的 escape 必須保留。

## Context

`feature/layout-claude` 分支（worktree: `.claude/worktrees/eager-liskov/`）的「策略買入分數」區塊（`#section-strategy-scores`）目前對每個股票顯示 29 條策略的個別分數（`scorecard_web.json` 提供的**−1 到 1 連續值**——大多數正分、約 0.2% 為負分代表「不看好」訊號）。長官回饋策略過多、表格冗長，希望改成「策略類別」維度聚合，每個類別一行 row，揭示該股在類別內的訊號分布而非個別策略細節。

策略名稱前綴決定類別（如 `F14_*`、`F28_*`、`Trading_*`）—— `F14` / `F28` 來自研究員 Excel 的 sheet name（[`ScoreCard_V2_New/BuildReasearcherDividendFile.py:21`](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/ScoreCard_V2_New/BuildReasearcherDividendFile.py)），是研究員定義的因子集 / 策略類別。目前 `scorecard_web.json` 的 29 條策略分布：

- F14: 20 條
- F28: 8 條
- 其他: 1 條（`Trading_EE1`）

最終目的：把表格從 N=29 row 縮為 ~3 row，但保留「類別內訊號離散程度」的訊息（同時顯示平均、最高、最低、覆蓋率）。

## Locked-in decisions（已和使用者確認）

| 決策點 | 決議 |
|---|---|
| 表格欄位 | **5 欄：類別 / 平均 / 最高 / 最低 / 覆蓋 M/N** |
| 是否引入 winner / 績效資料 | **不引入**。純粹對該股當下分數做數學聚合，不需要 `strategy_ticker_holding_summary.csv`。 |
| 類別判定 | 由策略名前綴 regex `^(F\d+)_` 切；命中 → `F\d+` 為類別；未命中 → `其他`。 |

## 類別劃分（以目前 `scorecard_web.json` 為例）

| 類別 | 策略條數 | 策略列表 |
|---|---|---|
| F14 | 20 | F14_GMCTS, F14_MCTS1–13, F14_RMCTS, F14_SSH739, F14_SSL495, F14_Testing1–3 |
| F28 | 8 | F28_EEF28S1–3, F28_MCTS1–5 |
| 其他 | 1 | Trading_EE1 |

> 重要：類別總策略數（分母 N）由 `strategySnapshot.strategies` 全表算出，**不是**由 `tickers[ticker].strategy_scores` 算（後者只是該股有分數的子集，當分母會虛偽放大覆蓋率）。

## Files to modify

全部位於 `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/`：

| 檔案 | 改動 |
|---|---|
| `js/modules/strategy_scores.js` | 重寫 `renderStrategyScores`：加 `categorize` / `aggregateByCategory` / `sortRows` helpers（皆 export 供測試）；用聚合結果產出 5 欄表格；`currentSort` 預設改為 `{ key: "max", dir: "desc" }`，排序鍵集改為 `category/mean/max/min/scoredCount`；保留 `Object.keys(scoresMap).length === 0` 早退 `showNotApplicable`。 |
| `css/style.css` | 在 `/* === Strategy scores === */` 區塊（line 475–498+）後追加 `.strategy-category-row` 樣式；舊 `.strategy-score-row*` 規則標 legacy 保留。 |
| `tests/dom_smoke.test.js` | 改寫 line 100–135 測試：rename 為「escapes snapshot text in tooltips and headers, drops latest_date from DOM」；XSS payload 塞進策略名 → tooltip；新增 `latest_date` payload **反向** assertion（不應出現於 DOM）。新增 render-layer 兩個測試：empty scoresMap → NotApplicable；非空 → aggregate table。 |
| `tests/strategy_scores.test.js`（新檔） | 純函數測試：`categorize`、`aggregateByCategory`（含**負分**、orphan scores、all-stale、null aggregates、scoredCount 對應 strategiesMeta 而非 scoresMap 等 edge cases）、`sortRows`（**null 永遠最後**、字串 asc/desc）。 |

`index.html`（line 97–100 `#strategy-scores-container`）和 `js/main.js`（line 38、80、211、468–476 呼叫點）**不動**。`scorecard_web.json` 也不動。

## 1. 資料模型

### 輸入（不變）

`renderStrategyScores(strategySnapshot, ticker)` 兩個參數：

- `strategySnapshot.strategies = [{name, latest_date, is_stale}, ...]` — snapshot 中所有策略 meta（總體策略池）。
- `strategySnapshot.tickers[ticker].strategy_scores = {name: scoreNumber, ...}` — 該股的分數 map，**值域 −1 到 1**（連續值，可為負）。
- `strategySnapshot.as_of` — snapshot 時間戳。

### 中間表（新增）

```js
{
  categories: [
    {
      category: "F14",            // 類別 ID（也作顯示名稱）
      total: 20,                  // 該類別總策略數（分母 N）
      scoredCount: 18,            // 該股有分數的策略數（分子 M）
      mean: 0.21,                 // null if scoredCount === 0
      max: 0.47,                  // null if scoredCount === 0
      min: 0.10,                  // null if scoredCount === 0
      maxStrategy: "F14_MCTS13",  // tooltip 用，不在欄位顯示
      minStrategy: "F14_GMCTS",   // tooltip 用
      allStale: false,            // 整類別所有策略 is_stale 都為 true → row 加 .stale
    },
    // ...
  ],
  asOf: "2026-04-16",
}
```

### 不變式

- `categories.length` ≥ 1。
- 類別預設排序：`max desc`（最看好該股的類別在最上）。
- `mean` / `max` / `min` 為 `null` 的類別在排序時永遠排末（沿用現行 `sortRows` null-handling）。
- `scoredCount === 0` 的類別仍要顯示在表格（顯示 `—`），不要隱藏；用以揭示「該股完全沒被某類別覆蓋」這個事實。

### 兩層職責分離（重要）

`aggregateByCategory` 與 render 層的 `showNotApplicable` 早退是**兩個獨立的層**，不要混淆：

| 層 | 行為 |
|---|---|
| **純函數層**（`aggregateByCategory`） | 不論輸入有無分數，**永遠回傳每個 meta 中存在的類別**（即使整個 `categories` 中所有 `mean/max/min` 都是 `null`）。這是純資料聚合，職責單純。 |
| **Render 層**（`renderStrategyScores`） | 維持現行的 [strategy_scores.js:31-34](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/modules/strategy_scores.js) **早退路徑**：`Object.keys(scoresMap).length === 0` → `showNotApplicable(el, "此股未被任何策略評分")`，**不**呼叫 aggregate、**不**渲染 3-row 空表。 |

實作上：render 層先做早退判斷，通過後才呼叫 `aggregateByCategory(strategiesMeta, scoresMap)` 並渲染。純函數層永遠可被獨立測試（給空 scoresMap 也照常回 categories array，不抛例外）。

## 2. 聚合邏輯

新增 helpers 在 `strategy_scores.js` 頂部（export 供測試）：

```js
export const CATEGORY_REGEX = /^(F\d+)_/;
export const OTHER_CATEGORY = "其他";

export function categorize(strategyName) {
  const m = CATEGORY_REGEX.exec(strategyName);
  return m ? m[1] : OTHER_CATEGORY;
}

export function aggregateByCategory(strategiesMeta, scoresMap) {
  // Pass 1: 從 meta 建 bucket，並記錄所有已知 name
  const buckets = new Map();
  const knownNames = new Set();
  for (const meta of (strategiesMeta ?? [])) {
    if (!meta?.name) continue;
    knownNames.add(meta.name);
    const cat = categorize(meta.name);
    if (!buckets.has(cat)) {
      buckets.set(cat, { all: [], scored: [], staleCount: 0 });
    }
    const b = buckets.get(cat);
    b.all.push(meta);
    if (meta.is_stale) b.staleCount += 1;
    const score = scoresMap?.[meta.name];
    if (score != null && Number.isFinite(Number(score))) {
      b.scored.push({ name: meta.name, score: Number(score) });
    }
  }

  // Pass 2: 補 orphan scores（在 scoresMap 但 meta 缺失的）→ synthetic meta，歸類別
  // 既有 UI 行為是顯示 orphan scores（舊版 renderStrategyScores 會以 scoresMap 為主、meta 缺失時 fallback），新實作也要保留。
  for (const name of Object.keys(scoresMap ?? {})) {
    if (knownNames.has(name)) continue;
    const score = scoresMap[name];
    if (score == null || !Number.isFinite(Number(score))) continue;
    const cat = categorize(name);
    if (!buckets.has(cat)) {
      buckets.set(cat, { all: [], scored: [], staleCount: 0 });
    }
    const b = buckets.get(cat);
    // synthetic meta：is_stale 預設 false（無 latest_date 可判斷）；計入 all 以反映分母
    b.all.push({ name, latest_date: null, is_stale: false });
    b.scored.push({ name, score: Number(score) });
  }

  // Pass 3: 聚合
  const out = [];
  for (const [cat, b] of buckets) {
    const total = b.all.length;
    const scoredCount = b.scored.length;
    if (scoredCount === 0) {
      out.push({
        category: cat, total, scoredCount,
        mean: null, max: null, min: null,
        maxStrategy: null, minStrategy: null,
        allStale: total > 0 && b.staleCount === total,
      });
      continue;
    }
    let sum = 0, maxV = -Infinity, minV = Infinity, maxS = null, minS = null;
    for (const s of b.scored) {
      sum += s.score;
      if (s.score > maxV) { maxV = s.score; maxS = s.name; }
      if (s.score < minV) { minV = s.score; minS = s.name; }
    }
    out.push({
      category: cat, total, scoredCount,
      mean: sum / scoredCount,
      max: maxV, min: minV,
      maxStrategy: maxS, minStrategy: minS,
      allStale: b.staleCount === total,
    });
  }
  return out;
}
```

設計細節：
- `Number.isFinite(Number(score))` 過濾**仅** `NaN` / `Infinity` / 純非數字字串（如 `"abc"`）。**注意這個 filter 並不嚴格**：`Number("0.5")` → `0.5`（通過）、`Number("")` → `0`（通過！）、`Number("  ")` → `0`（通過！）、`Number(true)` → `1`，都會被當作有效分數計入。單看 JavaScript 轉型 `Number(null)` 也會是 `0`，但本實作在轉型前先用 `score != null` 排除 `null` / `undefined`。實際資料目前不會有這些隱式轉型情況（`scorecard_web.json` 都是 number 或 missing key），所以本實作 OK；但**若日後要拒絕空字串 / 空白字串 / boolean 等隱式轉型**，需改用嚴格版 helper（例如 `typeof score === "number" && Number.isFinite(score)`，明確要求型別已是 number）。對負分（−1 到 1 區間內）行為正確：`Number.isFinite(-0.5)` 為 `true`。
- `Math.min` / `Math.max` 起始值 `-Infinity` / `+Infinity` 對負分集合也運作正確：例如 `[-0.5, -0.1]` 的 `max = -0.1`、`min = -0.5`。
- `maxStrategy` / `minStrategy` 不顯示在欄位裡，只走 tooltip。
- `allStale` 在 `total === 0` 時為 `false`（理論上不會發生，但防禦式寫死）。
- **Orphan scores 處理**（reviewer 點 2）：若 `scoresMap` 中有 name 不在 `strategiesMeta`（資料不一致），第 2 pass 會補進 synthetic meta，歸類到對應 category（命中 `F\d+_` 就歸該類，否則「其他」），確保不被靜默吃掉。Synthetic meta 的 `is_stale` 預設 `false`、`latest_date` 為 `null`——資訊缺失時保守不打 stale。

## 3. 渲染與排序

### 表格樣板

```
類別        平均   最高   最低   覆蓋
F14         21    47    10    18 / 20
F28         18    38     5     7 /  8
其他         5     5     5     1 /  1
```

數字以 `Math.round(value * 100)` 顯示，與現行 [strategy_scores.js:118](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/modules/strategy_scores.js) 一致。**值域 −100 到 100**（不是 0–100）——分數本身可為負（約 0.2% 為負分），顯示時負號自然帶過，**不做 clamp**（−0.1 → `-10`、不變成 `0`）。`null` 顯示為 `—`。

範例輸出（含負分）：
```
類別        平均   最高   最低   覆蓋
F14         21    47   -10    18 / 20      ← 最低為 -10，代表類別內有條策略給出負分
F28         18    38     5     7 /  8
其他         5     5     5     1 /  1
```

CSS（§4）會給負值 cell 加 `.val-down`-like 視覺暗示（紅字），但這是 nice-to-have，不是契約必須——僅當 reviewer 認為負分需要視覺區別才加。

### `renderTable` / `renderRow` 大致樣板

```js
function renderTable(el, categories, asOf) {
  const curr = currentSort;
  el.innerHTML = `
    <div class="strategy-scores-header">
      <span class="muted">as of ${escapeHtml(asOf || "—")}，共 ${categories.length} 個策略類別</span>
    </div>
    <div class="overflow-x-auto">
      <table class="data-table strategy-scores-table">
        <thead>
          <tr>
            <th scope="col" data-sort-key="category"    class="cursor-pointer" aria-sort="${ariaSortValue("category", curr)}">類別${sortIndicator("category", curr)}</th>
            <th scope="col" data-sort-key="mean"        class="cursor-pointer" aria-sort="${ariaSortValue("mean", curr)}">平均${sortIndicator("mean", curr)}</th>
            <th scope="col" data-sort-key="max"         class="cursor-pointer" aria-sort="${ariaSortValue("max", curr)}">最高${sortIndicator("max", curr)}</th>
            <th scope="col" data-sort-key="min"         class="cursor-pointer" aria-sort="${ariaSortValue("min", curr)}">最低${sortIndicator("min", curr)}</th>
            <th scope="col" data-sort-key="scoredCount" class="cursor-pointer" aria-sort="${ariaSortValue("scoredCount", curr)}">覆蓋${sortIndicator("scoredCount", curr)}</th>
          </tr>
        </thead>
        <tbody>
          ${categories.map(renderRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRow(c) {
  const fmtPct = (v) => v == null ? "—" : Math.round(v * 100);
  const rowClass = c.allStale ? "strategy-category-row stale" : "strategy-category-row";
  const meanTitle = c.mean == null
    ? `${c.category} 類別在此股無評分（${c.scoredCount}/${c.total} 條策略）`
    : `${c.category} 平均 ${(c.mean * 100).toFixed(1)}（${c.scoredCount} 條策略）`;
  const maxTitle = c.maxStrategy
    ? `最高 ${(c.max * 100).toFixed(1)} 由 ${c.maxStrategy}`
    : "尚無評分";
  const minTitle = c.minStrategy
    ? `最低 ${(c.min * 100).toFixed(1)} 由 ${c.minStrategy}`
    : "尚無評分";
  return `
    <tr class="${rowClass}">
      <td class="mono">${escapeHtml(c.category)}</td>
      <td title="${escapeHtml(meanTitle)}">${fmtPct(c.mean)}</td>
      <td title="${escapeHtml(maxTitle)}">${fmtPct(c.max)}</td>
      <td title="${escapeHtml(minTitle)}">${fmtPct(c.min)}</td>
      <td>${c.scoredCount} / ${c.total}</td>
    </tr>
  `;
}
```

### 排序

- `currentSort` 預設改為 `{ key: "max", dir: "desc" }`。
- 允許排序鍵：`category`（預設 asc）、`mean` / `max` / `min`（預設 desc）、`scoredCount`（預設 desc）。
- 沿用 [strategy_scores.js:69-79 sortRows](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/modules/strategy_scores.js) 的 null-handling：`av == null → 1`、`bv == null → -1`。確認此邏輯讓 null 永遠排末（不論 dir）。
- 點擊 header 切換 dir 的 onclick handler 沿用現行寫法（同檔 line 52–66），只是 keys 改名。

### Tooltip 與 escaping

所有外部來源字串（`category` 字串、`maxStrategy` / `minStrategy` 名稱、`asOf`）進 HTML 模板前必須 `escapeHtml`：
- `category`：理論上是 `F\d+` 或固定 `其他`，但若資料異常仍要 escape。
- `maxStrategy` / `minStrategy`：直接來自 `strategySnapshot.strategies[].name`，可能含 XSS payload（dom_smoke 測試覆蓋）。
- `meanTitle` / `maxTitle` / `minTitle`：在進 `title="..."` 前已組好整段，整段一起 escape。

`escapeHtml` 從 `js/utils.js` import，沿用現行寫法。

## 4. CSS 變更（`css/style.css`）

在 `/* === Strategy scores === */` 區塊（line 475–498 附近）追加：

```css
.strategy-category-row td {
  vertical-align: middle;
  font-variant-numeric: tabular-nums; /* 數字直行對齊 */
}

.strategy-category-row td.mono {
  font-weight: 600; /* 類別名稱加粗 */
}

.strategy-category-row.stale {
  /* 整個類別策略全 stale 才標 */
  opacity: 0.6;
  background: var(--badge-warning-surface);
}
```

舊規則處理：
- `.strategy-score-row` / `.strategy-score-row.stale`（line 490–497）保留並在註解中標 `/* legacy: per-strategy row, kept for back-compat */`，下個 release 評估移除。
- `.strategy-scores-table` / `.strategy-scores-header` 既有規則（line 476–488）**沿用不動**，新表格直接套同 class。

## 5. 測試計畫

### 改寫 `tests/dom_smoke.test.js:100-135`（XSS 測試）

**Coverage 變動聲明**（reviewer 點 5）：
- 新表格**不再顯示** `latest_date` 欄位（既有的 `<script>oops()</script>` 測試 payload 不再在 DOM 出現）。
- 維持 coverage：`as_of` 與**策略名稱**（透過 tooltip 內 `maxStrategy` / `minStrategy`）的 escape 必須驗證。
- **新增反向 assertion**：`latest_date` payload 即便被傳入也**不應**出現在 DOM——這是確認「latest_date 已從 render path 完全移除」的契約測試。
- 測試名稱從原本暗示 `latest_date` escape 改為更通用的「escapes snapshot text fields in tooltips and headers」。

```js
test("renderStrategyScores escapes snapshot text in tooltips and headers, drops latest_date from DOM", () => {
  withMockDocument(
    { "strategy-scores-container": { innerHTML: "", onclick: null } },
    (elements) => {
      renderStrategyScores(
        {
          as_of: "<b>2026-04-16</b>",
          strategies: [
            { name: "F14_GMCTS", latest_date: "<script>oops()</script>", is_stale: false },
            // 含 XSS payload 的策略名 → categorize 為「其他」
            { name: '<svg onload="alert(1)">', latest_date: "2026-04-16", is_stale: false },
          ],
          tickers: {
            "2330": {
              strategy_scores: {
                "F14_GMCTS": 0.42,
                '<svg onload="alert(1)">': 0.91, // 「其他」類別的最高/最低，會出現在 tooltip
              },
            },
          },
        },
        "2330",
      );
      const { innerHTML } = elements["strategy-scores-container"];
      // 1) 原始 XSS payload 不該出現
      assert.doesNotMatch(innerHTML, /<svg onload=/);
      assert.doesNotMatch(innerHTML, /<b>2026-04-16<\/b>/);
      assert.doesNotMatch(innerHTML, /<script>oops\(\)<\/script>/);
      // 2) as_of 與策略名（tooltip）正確 escape
      assert.match(innerHTML, /&lt;b&gt;2026-04-16&lt;\/b&gt;/);
      assert.match(innerHTML, /&lt;svg onload=&quot;alert\(1\)&quot;&gt;/);
      // 3) latest_date 完全沒被 render（escape 後也不應出現）
      assert.doesNotMatch(innerHTML, /&lt;script&gt;oops\(\)&lt;\/script&gt;/);
      // 4) sort 預設 descending
      assert.match(innerHTML, /aria-sort="descending"/);
    },
  );
});
```

### 新增 `tests/strategy_scores.test.js`

純函數測試（`node --test` 跑）：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { categorize, aggregateByCategory } from "../js/modules/strategy_scores.js";

test("categorize uses F-prefix or 其他", () => {
  assert.equal(categorize("F14_GMCTS"), "F14");
  assert.equal(categorize("F14_MCTS10"), "F14");
  assert.equal(categorize("F28_MCTS5"), "F28");
  assert.equal(categorize("Trading_EE1"), "其他");
  assert.equal(categorize("RandomThing"), "其他");
  assert.equal(categorize(""), "其他");
});

test("aggregateByCategory computes mean/max/min/scoredCount/total correctly", () => {
  const meta = [
    { name: "F14_A", is_stale: false },
    { name: "F14_B", is_stale: false },
    { name: "F14_C", is_stale: false },
    { name: "F28_X", is_stale: true },
  ];
  const scores = { F14_A: 0.4, F14_B: 0.2, F14_C: 0.3, F28_X: 0.5 };
  const out = aggregateByCategory(meta, scores);
  const f14 = out.find((c) => c.category === "F14");
  assert.equal(f14.total, 3);
  assert.equal(f14.scoredCount, 3);
  assert.ok(Math.abs(f14.mean - 0.3) < 1e-9);
  assert.equal(f14.max, 0.4);
  assert.equal(f14.min, 0.2);
  assert.equal(f14.maxStrategy, "F14_A");
  assert.equal(f14.minStrategy, "F14_B");
  assert.equal(f14.allStale, false);
});

test("category with zero scored strategies returns null aggregates and shows in output", () => {
  const meta = [{ name: "F14_A", is_stale: false }];
  const scores = {}; // 該股完全沒分數
  const out = aggregateByCategory(meta, scores);
  const f14 = out.find((c) => c.category === "F14");
  assert.equal(f14.scoredCount, 0);
  assert.equal(f14.mean, null);
  assert.equal(f14.max, null);
  assert.equal(f14.min, null);
  assert.equal(f14.maxStrategy, null);
});

test("category marked allStale when every strategy is_stale is true", () => {
  const meta = [
    { name: "F14_A", is_stale: true },
    { name: "F14_B", is_stale: true },
    { name: "F28_X", is_stale: true },
    { name: "F28_Y", is_stale: false },
  ];
  const scores = { F14_A: 0.1, F14_B: 0.2, F28_X: 0.3, F28_Y: 0.4 };
  const out = aggregateByCategory(meta, scores);
  assert.equal(out.find((c) => c.category === "F14").allStale, true);
  assert.equal(out.find((c) => c.category === "F28").allStale, false);
});

test("aggregateByCategory ignores non-finite scores (NaN / undefined / strings)", () => {
  const meta = [
    { name: "F14_A", is_stale: false },
    { name: "F14_B", is_stale: false },
    { name: "F14_C", is_stale: false },
  ];
  const scores = { F14_A: NaN, F14_B: "not-a-number", F14_C: 0.5 };
  const out = aggregateByCategory(meta, scores);
  const f14 = out.find((c) => c.category === "F14");
  assert.equal(f14.total, 3);
  assert.equal(f14.scoredCount, 1); // 只有 F14_C 有效
  assert.equal(f14.mean, 0.5);
});

test("aggregateByCategory uses snapshot strategies as denominator (not score map)", () => {
  // 真實情境：snapshot 有 20 條 F14，但該股只有 18 條被評分 → 覆蓋 18/20
  const meta = Array.from({ length: 20 }, (_, i) => ({ name: `F14_S${i}`, is_stale: false }));
  const scores = {};
  for (let i = 0; i < 18; i++) scores[`F14_S${i}`] = 0.1 * (i + 1);
  const out = aggregateByCategory(meta, scores);
  const f14 = out.find((c) => c.category === "F14");
  assert.equal(f14.total, 20);
  assert.equal(f14.scoredCount, 18);
});

test("aggregateByCategory handles negative scores correctly (-1 to 1 range)", () => {
  // reviewer 點 1：實際資料 ~0.2% 為負分；max/min 對混合正負集合要正確
  const meta = [
    { name: "F14_A", is_stale: false },
    { name: "F14_B", is_stale: false },
    { name: "F14_C", is_stale: false },
  ];
  const scores = { F14_A: 0.5, F14_B: -0.3, F14_C: -0.1 };
  const out = aggregateByCategory(meta, scores);
  const f14 = out.find((c) => c.category === "F14");
  assert.equal(f14.scoredCount, 3);
  assert.ok(Math.abs(f14.mean - (0.5 - 0.3 - 0.1) / 3) < 1e-9); // ≈ 0.0333
  assert.equal(f14.max, 0.5);
  assert.equal(f14.maxStrategy, "F14_A");
  assert.equal(f14.min, -0.3);
  assert.equal(f14.minStrategy, "F14_B");
});

test("aggregateByCategory handles all-negative category (max < 0)", () => {
  // 邊界：類別內全部負分時，max 仍然是負數中最大者
  const meta = [
    { name: "F28_X", is_stale: false },
    { name: "F28_Y", is_stale: false },
  ];
  const scores = { F28_X: -0.5, F28_Y: -0.1 };
  const out = aggregateByCategory(meta, scores);
  const f28 = out.find((c) => c.category === "F28");
  assert.equal(f28.max, -0.1);
  assert.equal(f28.min, -0.5);
});

test("aggregateByCategory absorbs orphan scores (in scoresMap but not in meta) into 其他", () => {
  // reviewer 點 2：避免 orphan score 被靜默吃掉
  const meta = [{ name: "F14_A", is_stale: false }];
  const scores = {
    F14_A: 0.5,
    "Trading_Orphan": 0.3,    // 沒在 meta 中，但有命中 prefix=Trading → 歸「其他」
    "F14_Ghost": 0.2,         // 沒在 meta 中，但 prefix=F14 → 歸 F14（synthetic 補上）
  };
  const out = aggregateByCategory(meta, scores);
  const f14 = out.find((c) => c.category === "F14");
  assert.equal(f14.total, 2);          // F14_A (real) + F14_Ghost (synthetic)
  assert.equal(f14.scoredCount, 2);
  const other = out.find((c) => c.category === "其他");
  assert.equal(other.total, 1);
  assert.equal(other.scoredCount, 1);
});

test("aggregateByCategory ignores orphan with non-finite score", () => {
  const meta = [];
  const scores = { "F14_Ghost": NaN, "F14_Real": 0.5 };
  const out = aggregateByCategory(meta, scores);
  const f14 = out.find((c) => c.category === "F14");
  assert.equal(f14.total, 1);          // 只 F14_Real 進來
  assert.equal(f14.scoredCount, 1);
});
```

### 新增 sort 測試（reviewer 點 3）

抽出 / export 內部 `sortRows` 純函數（或 comparator），加 unit test 確認 `null` 永遠最後：

```js
import { sortRows } from "../js/modules/strategy_scores.js";

test("sortRows: null mean/max/min always last in both directions", () => {
  const make = (cat, mean, max, min) => ({
    category: cat, mean, max, min, scoredCount: 0, total: 0,
  });
  const rows = [
    make("F14", 0.3, 0.5, 0.1),
    make("F28", null, null, null),
    make("F99", 0.1, 0.2, 0.05),
    make("其他", null, null, null),
  ];

  // mean asc：null 排末
  sortRows(rows, { key: "mean", dir: "asc" });
  assert.equal(rows[0].category, "F99");        // 0.1
  assert.equal(rows[1].category, "F14");        // 0.3
  assert.equal(rows[rows.length - 1].mean, null);
  assert.equal(rows[rows.length - 2].mean, null);

  // mean desc：null 仍排末
  sortRows(rows, { key: "mean", dir: "desc" });
  assert.equal(rows[0].category, "F14");        // 0.3
  assert.equal(rows[1].category, "F99");        // 0.1
  assert.equal(rows[rows.length - 1].mean, null);
  assert.equal(rows[rows.length - 2].mean, null);

  // max / min 同理
  for (const key of ["max", "min"]) {
    for (const dir of ["asc", "desc"]) {
      sortRows(rows, { key, dir });
      assert.equal(rows[rows.length - 1][key], null,
        `${key} ${dir}: 倒數第一應為 null`);
      assert.equal(rows[rows.length - 2][key], null,
        `${key} ${dir}: 倒數第二應為 null`);
    }
  }
});

test("sortRows: category as string sorts asc/desc lexicographically", () => {
  const rows = [
    { category: "F28" }, { category: "F14" }, { category: "其他" },
  ];
  sortRows(rows, { key: "category", dir: "asc" });
  assert.deepEqual(rows.map(r => r.category), ["F14", "F28", "其他"]);
  sortRows(rows, { key: "category", dir: "desc" });
  assert.deepEqual(rows.map(r => r.category), ["其他", "F28", "F14"]);
});
```

> 實作備註：現行 [strategy_scores.js:69-79](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/modules/strategy_scores.js) 的 `sortRows` 並未 export；改造時把它 export 出來才能測。語意保持：`if (av == null) return 1; if (bv == null) return -1;` 不論 dir 都讓 null 在後。

### 新增 render 層測試：分隔兩層（reviewer 點 4）

> **檔案位置**：以下兩個 render-layer 測試**直接加在 `tests/dom_smoke.test.js`** 同檔內（在現有 `renderStrategyScores escapes ...` 測試旁邊），沿用同檔的 local `withMockDocument` helper（[dom_smoke.test.js:7](file:///Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/tests/dom_smoke.test.js)）。**不要**另立 `tests/helpers.js`——目前 repo 沒有共用 helpers 檔，本次改造也不應引入（其他測試檔如 `tests/income.test.js`、`tests/revenue.test.js` 各自重複定義 `withMockElement` 是 repo 既有風格）。

`dom_smoke.test.js` 既有 import 已涵蓋所需符號，下面只列要新增的 `test(...)` block：

```js
// 加在 dom_smoke.test.js 內，緊接在現有 "renderStrategyScores escapes..." 測試之後

test("renderStrategyScores shows NotApplicable when scoresMap is empty (does NOT render aggregate table)", () => {
  withMockDocument(
    { "strategy-scores-container": { innerHTML: "", onclick: null } },
    (elements) => {
      renderStrategyScores(
        {
          as_of: "2026-04-16",
          strategies: [{ name: "F14_A", latest_date: "2026-04-16", is_stale: false }],
          tickers: { "2330": { strategy_scores: {} } }, // 空 scoresMap
        },
        "2330",
      );
      const { innerHTML } = elements["strategy-scores-container"];
      // 不應出現 aggregate 表的標題列
      assert.doesNotMatch(innerHTML, /strategy-category-row/);
      assert.doesNotMatch(innerHTML, /<thead>/);
      // 應出現 NotApplicable 訊息（沿用現行 showNotApplicable）
      assert.match(innerHTML, /未被任何策略評分|此股無分數/);
    },
  );
});

test("renderStrategyScores renders aggregate table when scoresMap is non-empty", () => {
  withMockDocument(
    { "strategy-scores-container": { innerHTML: "", onclick: null } },
    (elements) => {
      renderStrategyScores(
        {
          as_of: "2026-04-16",
          strategies: [
            { name: "F14_A", latest_date: "2026-04-16", is_stale: false },
            { name: "F28_X", latest_date: "2026-04-16", is_stale: false },
          ],
          tickers: { "2330": { strategy_scores: { F14_A: 0.5 } } },
        },
        "2330",
      );
      const { innerHTML } = elements["strategy-scores-container"];
      assert.match(innerHTML, /strategy-category-row/);
      // 即使 F28 該股無分數，仍顯示為 row（— 標示）
      assert.match(innerHTML, /F28/);
      assert.match(innerHTML, /—/);
    },
  );
});
```

### `tests/strategy_snapshot_contract.test.js`（不動）

`scorecard_web.json` 結構沒變，這個測試繼續綠燈。

跑法：`npm test`。

## 6. 風險與緩解

| 風險 | 緩解 |
|---|---|
| **A. 類別覆蓋率懸殊**（F14 有 20 條，「其他」僅 1 條） | 「覆蓋 M/N」直接揭示樣本量；視覺上不需特別處理。日後若想對 `total < 3` 的類別加 `.low-coverage` 樣式作 visual cue，不在本 plan 範圍。 |
| **B. 類別最高 / 最低差異大時，平均會誤導** | 同欄顯示 max 與 min，使用者直接看離散程度；mean tooltip 補上樣本數。 |
| **C. `allStale` 判定**（既有單條 row stale 機制有出現過 false-positive 顧慮） | `allStale` 只在「整個類別所有策略 is_stale 都為 true」才觸發；混合 stale 不打 stale 樣式，避免假警報。 |
| **D. 排序 null-handling 在 desc 方向反向** | `sortRows` 內 `av == null → return 1` 邏輯讓 null 永遠在後（無論 mul 正負）。新增測試 explicit 驗證 null 排末。 |
| **E. 既有 escape 測試 assertion 對應的 DOM 路徑改變** | 新表格不再把策略名寫進 `<td>`，但仍寫進 `title` attribute。改寫 dom_smoke 測試 assertion 對齊 tooltip 路徑。 |
| **F. `Trading_EE1` 唯一一條的「其他」類別** | aggregate 後 `mean = max = min`，覆蓋 1/1，行為自然；新測試覆蓋此 edge case。 |
| **G. 未來新增類別前綴**（如 F35、F42） | `categorize` regex 自動命中；不需要改程式。 |
| **H. 負分顯示**（reviewer 點 1） | `Math.round(value * 100)` 對負數天然正確，不做 clamp。CSS 可選地給負值上 `.val-down` 紅字（nice-to-have 不必須）。新增測試覆蓋 `[-0.5, -0.3, -0.1]` 與全負類別 edge case。 |
| **I. Orphan scores**（reviewer 點 2） | aggregate 第 2 pass 補 synthetic meta，把 `scoresMap` 中沒對應 meta 的 name 歸類別。實際資料目前不會發生（meta-only=0、scores-only=0），但日後資料漂移時不會靜默吃掉分數。新增測試覆蓋此路徑。 |
| **J. Render 層與純函數層職責混淆**（reviewer 點 4） | 文件 §1「兩層職責分離」明確分隔；render 層的 `showNotApplicable` 早退保留，純函數層仍可被獨立測試。 |

## Implementation sequence

1. 在 `js/modules/strategy_scores.js` 重寫：
   1. 頂部加 `categorize` / `aggregateByCategory` helpers 並 `export`；`aggregateByCategory` 內部 3-pass（meta → orphan synthesize → 聚合）。
   2. **`sortRows` 從 module-private 改為 export**（為了讓單元測試可獨立呼叫）；行為不變。
   3. `renderStrategyScores` 早退路徑 `Object.keys(scoresMap).length === 0 → showNotApplicable` 保留不動，是 render 層職責。
   4. 早退通過後才呼叫 `aggregateByCategory(strategiesMeta, scoresMap)` → `sortRows` → 渲染 5 欄表格。
   5. `currentSort` 預設改為 `{ key: "max", dir: "desc" }`；排序鍵集改為 `category/mean/max/min/scoredCount`。
   6. onclick sort handler 沿用，但驗證 keys 切換正常。
2. 新增 `tests/strategy_scores.test.js`（純函數測試，包含 reviewer 要求的負分、orphan、sort null-handling 案例）。
3. 改寫 `tests/dom_smoke.test.js:100-135`：rename 測試名、新增 `latest_date` 反向 assertion、新增 render-layer 兩個測試（empty → NotApplicable；非空 → aggregate table）。
4. `css/style.css` 追加 `.strategy-category-row` 區塊；舊 `.strategy-score-row*` 加 legacy 註解。
5. 跑 `npm test` 確認所有測試綠燈（含 `tests/strategy_snapshot_contract.test.js` 不變、`tests/dom_smoke.test.js` 改寫）。
6. 手動驗證（見下節），含挑負分股票（如 `1326`、`2597`）確認負值顯示。

## Verification

**單元測試**：
```bash
cd /Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov
npm test
```
所有測試需綠燈，重點關注：
- `tests/strategy_scores.test.js`（新檔）
- `tests/dom_smoke.test.js`（改寫的 escape 測試）
- `tests/strategy_snapshot_contract.test.js`（不動，應繼續綠燈）

**E2E 手動驗證**（vanilla JS，無 build step）：
```bash
cd /Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov
python3 -m http.server 8000
# 瀏覽器開 http://localhost:8000
```

依序測：
1. 輸入有完整評分的股票（如 `2330`）：表格出現 3 row（F14 / F28 / 其他），數字格顯示 −100 到 100 整數（負分原樣顯示，不 clamp）；hover 數字格出現 tooltip 顯示貢獻策略名。挑一檔已知含負分的 ticker（從 `1326`、`2597`、`8210`、`6492`、`8033` 中任選——資料中 F14_RMCTS / F14_SSL495 / F14_GMCTS 在這些股票上有負分）驗證負值正常呈現。
2. 輸入小股或冷門股：可能某類別 `scoredCount === 0`，row 顯示 `—` 但仍出現在表格。
3. 輸入完全無評分股票：顯示「此股未被任何策略評分」（沿用現行）。
4. 點擊每個欄位 header：類別 asc/desc 切換、mean/max/min/scoredCount asc/desc 切換、`null` 值始終排末。
5. 含 XSS payload 的測試資料（手動 inject 或既有測試代理）：DOM 不被 break，innerHTML 中找不到原始 `<script>` / `<svg onload>` 標籤。
6. F14 整類 stale 時（手動構造或等資料漂白），row 出現 `.stale` 半透明樣式。

**回歸驗證**：
- `index.html`、`js/main.js`、`scorecard_web.json` 沒有變更。
- 其他區塊（K 線、估值、規則警示等）顯示一致。
- `tests/strategy_snapshot_contract.test.js` 繼續綠燈，確認 snapshot 結構契約沒被改動。

## Critical Files Reference

全為絕對路徑（避免 plan 檔搬位置時連結失效）：

- `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/modules/strategy_scores.js` — 渲染模組（主改）
- `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/index.html`（line 97–100）— `#strategy-scores-container`（不動）
- `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/main.js`（line 38、80、211、468–476）— 既有呼叫點（不動）
- `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/scorecard_web.json` — 資料來源（不動）
- `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/css/style.css`（line 475–498 附近）— 既有 strategy scores CSS，新樣式追加於後
- `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/tests/dom_smoke.test.js`（line 100–135）— 待改寫測試
- `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/tests/strategy_snapshot_contract.test.js` — snapshot 契約測試（不動）
- `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/tests/strategy_scores.test.js` — 新檔，純函數測試
- `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/js/utils.js` — 共用 `escapeHtml`、`showError`、`showNotApplicable`
- `/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov/ScoreCard_V2_New/BuildReasearcherDividendFile.py`（line 21）— `F14` / `F28` 類別命名來源（read-only 參考）
