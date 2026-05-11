# 即時規則警示時間軸修正 + 個股中文名稱搜尋（2026-05-11）

> **分支**：`feature/layout-claude`
> **Worktree**：`/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov`
> **範圍**：
> 1. 修正「即時規則警示」近 6 期時間軸對月/季規則的錯誤對齊（含 K 線評分覆蓋線、股票摘要警示分數的同步修正）
> 2. 個股搜尋支援輸入中文名稱（不只是股票代號）
> **不在範圍**：規則邏輯本身（S10–S22 觸發條件不變）、ScoreCard Python pipeline、評分公式、規則表格 UI 樣式。

---

## 一、Bug 確認

以股票代號 1101（2026-05-08 報價）的截圖為準，確認三個問題皆為實際 bug：

### Bug 1 ─ 月頻規則把「當月（2026-05）」當作最新欄

| 規則 | 2025-12 | 2026-01 | 2026-02 | 2026-03 | 2026-04 | 2026-05 |
|------|--------|---------|---------|---------|---------|---------|
| S10 累積營收連三月 YOY < -10% | ○ | ○ | ○ | ○ | — | — |
| S20 單月營收年增率連兩月衰退 | ○ | ○ | ○ | ● | — | — |

* 月營收公告日期 `2026-04-10`，最新可用 `monthsales` 為 2026-03。
* 報價已有 2026-05-01..08，但月報尚未公告，因此最新兩欄（2026-04、2026-05）必然是 NA。
* 長官期望：**避開未結束的月份**，最右欄應該對齊到「最近一個已結束的月份」（截圖案例為 2026-04）。

### Bug 2 ─ 季頻規則 6 欄只展開 2 個季度

| 規則 | 2025-12 | 2026-01 | 2026-02 | 2026-03 | 2026-04 | 2026-05 |
|------|--------|---------|---------|---------|---------|---------|
| S11 連兩季稅後淨利 YOY < -5% | 2025Q4 ● | 2025Q4 ● | 2025Q4 ● | 2026Q1 — | 2026Q1 — | 2026Q1 — |
| S12 連兩季營業利益 YOY < -5% | 同上 | 同上 | 同上 | 同上 | 同上 | 同上 |
| S13 YTD 稅後獲利 YOY < -10% | 同上 | 同上 | 同上 | 同上 | 同上 | 同上 |

* 6 個欄位（月頻 axis）只跨到 2 個自然季度，季頻規則因此重複 3 次相同 quarter key。
* 長官期望：**6 欄要對應 6 個不同季度**（截圖案例：2024Q3、2024Q4、2025Q1、2025Q2、2025Q3、2025Q4，因為 2026Q1 尚未公告）。

### Bug 3 ─ 個股搜尋只能輸入代號

* `index.html:23` `<input id="ticker-input" placeholder="輸入股票代號，例如 2330">`
* `js/main.js:613-616` `const ticker = tickerInput.value.trim(); ... search(ticker);` —— 直接把字串當 ticker 餵給 Dottdot API。
* 輸入「台泥」會打 `?ticker=台泥` 失敗。長官需求：能輸入中文名稱（如「台泥」）也可以查詢。

---

## 二、根因分析

### 2.1 共用程式：`js/lib/rule_engine.js`

7 條規則的近 6 期 `recentPeriods` 與 K 線 overlay 的 `fullPeriodScores`，都來自 `computeRuleAlerts()`：

```js
// js/lib/rule_engine.js:520-588
const fullAxis = buildMonthEndAxis(quotes);            // 月頻 axis
...
periods: checkS10(monthsales, fullAxis),               // 月
periods: checkS20(monthsales, fullAxis),               // 月
periods: checkS11(incomeQ, fullAxis),                  // 季 ← 用月頻 axis
periods: checkS12(incomeQ, fullAxis),                  // 季 ← 用月頻 axis
periods: checkS13(incomeQ, fullAxis),                  // 季 ← 用月頻 axis
periods: checkS22(quotes, stats, fullAxis),            // 月底快照
periods: checkS17(quotes, fullAxis),                   // 月底快照
```

`buildMonthEndAxis(quotes)` 以 `date.slice(0,7)` 做月分桶（`js/lib/rule_engine.js:62-84`）。一旦報價中已經有 2026-05-01..08 的資料列，axis 末端就會出現 `2026-05` ─ 即使該月仍未結束。

`recentPeriods` 是從 axis 取 `slice(-6)`，因此：

* **Bug 1**：最右欄被「當月（未結束）」吃掉一格，月頻規則因 monthsales 還沒進來而恆為 NA；股票摘要的「警示分數 = triggered / available」也因此被多算了一個 NA。
* **Bug 2**：6 個月只能跨 2~3 個季度，`checkQuarterlyYOYDeclineSeries` 的 axis 模式（`js/lib/rule_engine.js:226-240`）依 axis 上每一個月對應的 quarter key 取資料，必然出現重複季度。

### 2.2 季頻規則的 axis 對應函式

```js
// js/lib/rule_engine.js:102-121
function settledQuarterKeyForMonthLabel(monthLabel) {
  // 2026-05 → 2026Q1，2026-04 → 2026Q1，2026-03 → 2026Q1
  // 2026-02 → 2025Q4，2026-01 → 2025Q4，2025-12 → 2025Q4
  ...
}
```

這是「given a month, what's the most recently *settled* quarter」。設計目的是讓 K 線 overlay 在某月份顯示對應季的分數，所以 monthly axis × quarterly rule 必然產生連續重複格 ─ 這是 K 線 overlay 想要的行為，但展示在規則表 6 欄裡就變成「只有 2 個季度」。

### 2.3 K 線評分覆蓋線、股票摘要的耦合

* `js/main.js:329-340` 計算 `ruleResult` 後：
  * `setRuleScoreOverlay(ruleResult.fullPeriodScores)` → K 線黃色折線
  * `computeAlertScore(ruleResult.latestAvailableCount, ruleResult.latestAlertCount)` → 股票摘要分數卡
  * `renderRuleAlerts(ruleResult)` → 即時規則警示表格
* `latestAvailableCount` 來自 `recentPeriods[5]`（最新一格）。Bug 1 讓「最新一格」變成未結束月份，於是月頻規則 latest 都是 NA → `available` 被低估、警示分數的分母被壓低（甚至顯示「資料不足」），這也是長官提到「警示判斷結果會顯示在股票摘要」的點。
* `fullPeriodScores` 是「完整月頻 axis」對應的每月分數。Bug 1 讓 K 線右側多出一個 NA 月（無分數點），實質影響很小（只是少一個點）；Bug 2 在 `fullPeriodScores` 中**不算 bug**，因為 K 線 overlay 本來就要月頻顯示季規則。

### 2.4 搜尋輸入

```js
// js/main.js:613-616
function debouncedSearch() {
  const ticker = tickerInput.value.trim();
  ...
  setTimeout(() => search(ticker), 300);
}
```

* 沒有任何「名稱 → 代號」的解析步驟。
* 可用的名稱字典：
  * `strategy_ticker_holding_summary.csv`（已在 `loadStrategyData()` 載入，欄位 `股票代號, 股票名稱`，1300+ 檔）
  * `scorecard_web.json` 無名稱欄位
  * Dottdot Profile API 有 `股票名稱`，但要先知道代號才能呼叫，不可逆查。
* 已掛載 strategy CSV 的 `loadStrategyData()` 在 app 啟動時就執行（`js/main.js:654`），延遲幾百毫秒就有完整名稱表，無需新增 fetch。

---

## 三、修正計畫

### Step A ─ 月頻 axis 排除「尚未結束的月份」（Bug 1）

**目標**：axis 中只保留「整個月已經結束」的月份。「結束」的判定依台北時間：

* 該月份 < 台北今天所在的月份 → 一律保留（過去月份）
* 該月份 == 台北今天所在的月份 → 僅當「台北今天 ≥ 該月最後一個日曆日」才保留

**為什麼是「>= 月最後一個日曆日」**：截圖案例 today=2026-04-30 應該要保留 2026-04（長官原話「現在五月還沒過完，所以應該要從 4 月開始往前算」）。`label < cutoffMonth` 的字串比較會把月底那天也排掉，與意圖矛盾，這是上一版計劃的 bug。

**做法**：在 `js/lib/rule_engine.js` 新增 helpers，全部以 `Asia/Taipei` 為時區基準（避免 UTC 在凌晨 0~7 點把月份算錯）：

```js
const TAIPEI_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "YYYY-MM-DD" in Taipei
function taipeiDateIso(today = new Date()) {
  return TAIPEI_DATE_FMT.format(today);  // en-CA 固定產生 ISO 格式
}

// "YYYY-MM"
function taipeiMonthKey(today = new Date()) {
  return taipeiDateIso(today).slice(0, 7);
}

// 該月最後一個日曆日（不分平假日；目的在「日曆月是否已結束」）
function lastDayIsoOfMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();   // m 是 1-based，傳 m 即下月零日 = 本月最後一天
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

function isMonthClosed(monthKey, today = new Date()) {
  const todayIso = taipeiDateIso(today);
  return todayIso >= lastDayIsoOfMonth(monthKey);
}
```

修改 `buildMonthEndAxis`：

```js
export function buildMonthEndAxis(quotes, today = new Date()) {
  return monthEndRows(quotes)
    .filter(({ label }) => isMonthClosed(label, today))
    .map(({ label, row }) => ({ ... }));
}
```

`computeRuleAlerts({ ..., today })` 加上同名 optional 參數（預設 `new Date()`），往下傳給 `buildMonthEndAxis` 與 `buildQuarterlyAxis`。

**邊界行為對照表**（以台北時間為準）：

| 台北 today | 月份 2026-04 是否保留 | 月份 2026-05 是否保留 |
|------------|---------------------|---------------------|
| 2026-04-29 | ✗（今天 < 4/30）    | ✗ |
| 2026-04-30 | ✓（今天 == 4/30）   | ✗ |
| 2026-05-01 00:30 | ✓             | ✗ |
| 2026-05-01 09:00 | ✓             | ✗ |
| 2026-05-08 | ✓                  | ✗ |
| 2026-05-31 | ✓                  | ✓ |
| 2026-06-01 | ✓                  | ✓ |

對比 UTC 方案的破洞：台北 2026-05-01 02:00 在 UTC 是 2026-04-30 18:00，`getUTCMonth()` 會回傳 4 → cutoffMonth=`2026-04` → 把 2026-04 也排掉。改 `Asia/Taipei` 後不再受影響。

**對 K 線 overlay 的影響**：
* `fullPeriodScores` 由 `fullAxis` 推導 → axis 少一個月，overlay 少一個點。1101 案例下，最右一個分數點從 2026-05 → 2026-04。
* 不會破壞既有 `kline.test.js` 對「overlay 落點落在月底日期」的契約（只是少一個點）。

**對股票摘要的影響**：
* `recentPeriods[5]`（latest）會變成 2026-04 的儲存格 → 月規則終於有機會「不是 NA」（只要 monthsales 有 2026-04 資料；目前案例還沒，但這是資料端問題，不再是 axis bug）。
* `latestAvailableCount`、`latestAlertCount`、`alertScore` 跟著正確化。

### Step B ─ 季頻規則改用季頻 axis 顯示 6 期（Bug 2）

**目標**：規則表上 S11/S12/S13 那 3 列，6 欄要顯示 6 個不同的季度（最新可用季度 + 往回 5 季）。

**做法（拆分顯示 axis 與 overlay axis）**：

1. `computeRuleAlerts` 內額外建一個 `quarterlyAxis`：
   ```js
   const quarterlyAxis = buildQuarterlyAxis(incomeQ, today);
   ```
   `buildQuarterlyAxis(rows, today)` 回傳：
   * 來源：`incomeQ` 中的 `年季` 欄（settled quarter）
   * 過濾：排除「今天所在的季度尚未公告」的情形 ─ 用 `incomeQ` 實際存在的最大 `年季` 為上界
   * 排序：升冪
   * **每筆 axis entry 形狀**（注意 `label` 必須是季字串，rule_alerts.js:61 直接 render `period.label`）：
     ```js
     {
       label:        "2024Q3",      // ← 給 rule_alerts 表格 cell 顯示用，必為 formatYQ(quarterKey)
       quarterKey:   "202403",      // ← 給 checkS11/12/13 用來 lookup incomeQ
       monthLabel:   "2024-09",     // ← 對齊到 K 線月頻 axis 的同月（保留語意，便於除錯）
       date:         "2024-09-30",  // ← 季末日期，給 fullPeriodScores 落到 K 線時間軸
       dateIso:      "2024-09-30",
     }
     ```
     這跟月頻 axis 的 `axisMonthLabel/axisDate` 取值順序一致，但 `label` 與 `monthLabel` **刻意不同**（前者顯示「2024Q3」，後者顯示「2024-09」）。
   * `axisMonthLabel(axisEntry)` 在月頻 axis 上回 `monthLabel ?? label`（兩者相同），在季頻 axis 上會回 `monthLabel`（季末月）─ 因此季規則的 cell 不會把「2024Q3」誤當月份去做 `formatYM` 比對。
   * **新增 `axisDisplayLabel(axisEntry)`** helper，回傳 `axisEntry.label`，由 quarterly checkers 寫入 cell 的 `label` 欄。月頻仍維持 `label = monthLabel`。

2. 把 `checkS11/checkS12/checkS13` 的呼叫從 `fullAxis`（月頻）改成「季頻顯示 axis 用 `quarterlyAxis`」+「月頻 overlay axis 用 `fullAxis`」：

   ```js
   // 結構從單一 periods 改成兩條
   const s11DisplayPeriods = checkS11Quarterly(incomeQ, quarterlyAxis);
   const s11OverlayPeriods = checkS11(incomeQ, fullAxis);  // 維持月頻供 K 線用

   {
     code: "S11", ...,
     periods: s11OverlayPeriods,           // K 線/fullPeriodScores 用
     displayPeriods: s11DisplayPeriods,    // rule_alerts 表格用
   }
   ```

   * 新增 `checkS11Quarterly / checkS12Quarterly / checkS13Quarterly`，內部直接吃 `quarterlyAxis` 上每一格對應的 quarter key（不再經由 `settledQuarterKeyForMonthLabel`）。
   * 月頻規則（S10/S20）和月底快照規則（S17/S22）不需要新增 displayPeriods，它們的 monthly axis 已經是「6 個不同月」。

3. `recentPeriods` 衍生：
   * 月頻、月底快照規則：`padOldestFirst(periods)`（取自 monthly fullAxis 的最後 6 個月）
   * 季頻規則：`padOldestFirst(displayPeriods)`（取自 quarterlyAxis 的最後 6 季）
   * `latest = recentPeriods[5]` 邏輯不變，季規則的 `latest` 會變成「最新已公告季度」（截圖案例為 2025Q4）

4. `fullPeriodScores`（K 線 overlay）依然用 `periods`（月頻），不變 ─ 季規則仍然以「該月所屬已 settled 季」為 K 線該月的分數來源（保留原本 K 線視覺）。

5. `rule_alerts.js` 的 `normalizePeriods()` 仍然吃 `recentPeriods`，無需改動。

6. **`recentPeriodScores` 的語意處理**（防止季規則改成季頻後與月規則錯位 align）：
   * 現況：`computeRuleAlerts` 回傳的 `recentPeriodScores` 是用 `recentPeriods` 算出來的 6 個 score points（[`js/lib/rule_engine.js:603`](../../js/lib/rule_engine.js)）。`computePeriodScores` 是 by index 對齊；如果 S11/12/13 的 `recentPeriods` 從「6 個月」變成「6 個季」，那 index 0~5 對 S10 是月、對 S11 是季 → aggregate 出來就是「不同時間軸的 cells 被硬塞到同一格」的混頻 summary。
   * 兩個現有 consumer：[`tests/rule_engine.test.js:325`](../../tests/rule_engine.test.js)、[`tests/rule_engine.test.js:357`](../../tests/rule_engine.test.js) 只 assert `length === 6`，K 線 overlay 走 `fullPeriodScores`，UI 的警示分數走 `latestAvailableCount/latestAlertCount` ─ 沒有人實際讀取每個 cell 的數值。
   * 但仍要避免「未來有人誤用」，採方案 A：
     **方案 A（首選，保留 monthly overlay 語意）**：把 `recentPeriodScores` 改成「對 monthly recent axis（fullAxis 的最後 6 月）的 score」─ 也就是 `padOldestFirst(rule.periods)`，**而不是** `rule.recentPeriods`。這樣 6 個 score 永遠對齊月頻時間軸，與 `fullPeriodScores` 同維度。
     ```js
     recentPeriodScores: computePeriodScores({
       rules: rules.map((rule) => ({
         ...rule,
         periods: padOldestFirst(rule.periods),  // 強制走月頻 axis 最後 6 月
       })),
     }),
     ```
     這也對應「規則表的 cells」與「分數時間軸」分離的核心設計：表格給人看，分數給時間序列用。
   * **方案 B（備案，若未來真的需要 mixed-frequency summary）**：把欄位改名為 `recentLatestScores` 或加 JSDoc 註明 `mixed-frequency: index does NOT correspond to any single time axis`；同步更新 `tests/rule_engine.test.js:325/357` 與所有讀取者。
   * 計畫採方案 A，並在 `tests/rule_engine.test.js` 加一條：「S11 的 recentPeriods 是季頻時，recentPeriodScores 仍與 monthly axis 對齊（每筆有可解析的 `YYYY-MM` label）」。

**邊界情境**：
* `incomeQ` 不足 6 季：`buildQuarterlyAxis` 回傳 < 6 entries，`padOldestFirst` 會在前面補 `naCell`，UI 顯示 `—`（既有行為）。
* `incomeQ` 為 null：跟 fullAxis 一樣，回傳 `padOldestFirst([])` 整列 NA。

### Step C ─ 個股搜尋支援中文名稱（Bug 3）

**目標**：在搜尋輸入框輸入「台泥」也能查到 1101，輸入「2330」維持原行為。

**做法**：

1. 新增 `js/lib/ticker_resolver.js`：

   **重要設計**：[`strategy.js:165-170`](../../js/modules/strategy.js) 在 fetch 失敗時會把 `holdingData = []` 並設 `status = "failed"`。`ensureStrategyDataLoaded` 在下次呼叫時會嘗試重新載入（只要 `status !== "loaded"`）。因此 `nameIndex` **絕對不能在 failed 狀態下被快取**，否則就算後來 CSV 載入成功，resolver 仍會卡在第一次的空 index 永遠失效。

   ```js
   import { ensureStrategyDataLoaded } from "../modules/strategy.js";

   // 只在 status === "loaded" 時設置；failed/pending 都不設，下次重試
   let cachedIndex = null;       // { names: Map<string, string> } | null

   function buildIndexFromHolding(holdingData) {
     const names = new Map();
     for (const row of holdingData) {
       const code = String(row?.["股票代號"] ?? "").trim();
       const name = String(row?.["股票名稱"] ?? "").trim();
       if (!code || !name) continue;
       // CSV 內名稱對代號為 1:1，後者覆蓋前者亦無衝突
       names.set(name, code);
     }
     return { names };
   }

   // 測試用 reset
   export function resetTickerResolverForTests() {
     cachedIndex = null;
   }

   export async function resolveTickerInput(input, deps = {}) {
     const ensureLoad = deps.ensureLoad ?? ensureStrategyDataLoaded;
     const text = String(input ?? "").trim();
     if (!text) return null;
     // 1. 純數字（含 4 碼上市/上櫃、5/6 碼 ETF/特別股）→ 直接當代號
     if (/^\d{4,6}[A-Z]?$/.test(text)) return text;
     // 2. 嘗試名稱對照（只有 loaded 時才快取）
     if (!cachedIndex) {
       const state = await ensureLoad();
       if (state?.status !== "loaded") {
         return null;   // 不快取，下次再試；資料端恢復後即可正常 resolve
       }
       cachedIndex = buildIndexFromHolding(state.holdingData ?? []);
     }
     if (cachedIndex.names.has(text)) return cachedIndex.names.get(text);
     // 3. 模糊比對：包含關鍵字的唯一公司
     const matches = [...cachedIndex.names.entries()].filter(([name]) =>
       name.includes(text),
     );
     if (matches.length === 1) return matches[0][1];
     return null;  // 不確定 → 交回 caller 處理 UI 提示
   }
   ```

   `deps.ensureLoad` 是注入點，方便 `tests/ticker_resolver.test.js` 用 mock 模擬 loaded / failed / pending 三種狀態。

2. **新增 `js/lib/search_controller.js`**（將 race-safe 排程抽成可單元測試的純模組，避免直接在 `main.js` 的 closure 裡寫死難以測）：

   現況：[`main.js:613`](../../js/main.js) 的 `debouncedSearch` 是 closure-scoped 函式，沒有 export，且只綁在 form `submit` / 按鈕 `click`（沒有綁 `input`）。所以 race 主要場景是「使用者快速重複 submit / 多次點擊送出 + resolver 還在跑」，而不是逐字打字。但只要新增 resolver 的 `await`，就有機會「上次 submit 還在 resolve、新 submit 已開始」的舊覆寫新。把調度抽出來才能測。

   ```js
   // js/lib/search_controller.js
   export function createSearchController({
     resolver,            // (text) => Promise<string|null>
     onResolved,          // (ticker) => void  ─ 真正觸發 search() 的地方
     onHint,              // (msg|null) => void
     onResolvedRewrite,   // (ticker) => void  ─ 同步把 input.value 改成代號
     debounceMs = 300,
     setTimeoutFn = setTimeout,
     clearTimeoutFn = clearTimeout,
   } = {}) {
     let timer = null;
     let seq = 0;

     function submit(rawInput) {
       // 1. 先取消上一個排程（無論輸入是否有效）
       if (timer != null) clearTimeoutFn(timer);
       // 2. 同步遞增 sequence；async 完成後拿來比對
       const mySeq = ++seq;
       const text = String(rawInput ?? "").trim();
       timer = setTimeoutFn(async () => {
         if (mySeq !== seq) return;       // 已被新 submit 超車
         if (!text) { onHint?.(null); return; }
         let resolved;
         try {
           resolved = await resolver(text);
         } catch {
           resolved = null;
         }
         if (mySeq !== seq) return;       // resolve 期間又被超車
         if (!resolved) {
           onHint?.(`找不到「${text}」對應的股票，請確認代號或名稱`);
           return;
         }
         onHint?.(null);
         onResolvedRewrite?.(resolved);
         onResolved?.(resolved);
       }, debounceMs);
     }

     function cancel() {
       if (timer != null) clearTimeoutFn(timer);
       timer = null;
       ++seq;                              // 把所有 in-flight 的 await 全部作廢
     }

     return { submit, cancel };
   }
   ```

   `js/main.js` 對接：

   ```js
   import { createSearchController } from "./lib/search_controller.js";
   import { resolveTickerInput } from "./lib/ticker_resolver.js";

   const searchController = createSearchController({
     resolver: resolveTickerInput,
     onResolved: (ticker) => search(ticker),
     onResolvedRewrite: (ticker) => {
       if (tickerInput.value !== ticker) tickerInput.value = ticker;
     },
     onHint: (msg) => (msg ? showSearchHint(msg) : hideSearchHint()),
   });

   if (searchForm) {
     searchForm.addEventListener("submit", (event) => {
       event.preventDefault();
       searchController.submit(tickerInput.value);
     });
   } else if (searchBtn) {
     searchBtn.addEventListener("click", () =>
       searchController.submit(tickerInput.value),
     );
   }
   ```

   要點：
   * `clearTimeout` 永遠在 `submit` 第一步，不依賴後面任何條件；
   * `seq` 同步遞增，async resolve 完成後比對，避免「點兩次送出」舊請求蓋掉新請求；
   * resolver 的錯誤被 swallow 成 `resolved = null`（顯示「找不到」），不讓 promise rejection 吞掉 hint；
   * `setTimeoutFn / clearTimeoutFn` 注入，測試可用 fake timer；`resolver / onResolved / onHint` 全部注入，測試完全 DOM-free。

   `showSearchHint()` / `hideSearchHint()` 用既有的 `welcomeMsg` 區塊或新增一個小型 `<div id="search-hint" aria-live="polite">` 即可。

3. `index.html:23,25` placeholder 與 sr-only label 同步更新：
   * `placeholder="輸入股票代號或名稱，例如 2330 或 台積電"`
   * `<label for="ticker-input" class="sr-only">股票代號或名稱</label>`

4. 進階（**選用，下一輪再做**）：自動完成下拉
   * 使用者輸入 ≥ 1 個字 → 列出最多 8 筆 `name.includes(text) || code.startsWith(text)` 的候選
   * 使用 `<datalist>` 即可避免新依賴：

     ```html
     <input list="ticker-suggestions" id="ticker-input" ...>
     <datalist id="ticker-suggestions"></datalist>
     ```

     在 `loadStrategyData()` 完成後 populate `<option value="2330">台積電</option>`。

5. **不**改 Dottdot API 端：所有 API 仍以代號傳遞，這支只是前端輸入轉譯。

### Step D ─ 測試

新增 `tests/rule_engine.test.js` 用例（沿用既有 mock 機制）：

| 用例 | 期望 |
|------|------|
| `buildMonthEndAxis` 在 today=2026-05-08、quotes 含 2026-05-01 時 | axis 末端為 `2026-04`，**不含** `2026-05` |
| `buildMonthEndAxis` 在 today=2026-04-30、quotes 含 2026-04-30 時 | axis 末端為 `2026-04`（保留當月最後一天） |
| `buildMonthEndAxis` 在 today=2026-04-29 時 | axis 末端為 `2026-03`（4 月還沒走完） |
| `buildMonthEndAxis` 在台北 today=2026-05-01 00:30（UTC 仍為 4 月）時 | axis 末端為 `2026-04`，不會因 UTC 取月而退回 `2026-03` |
| `buildMonthEndAxis` 在台北 today=2026-04-30 23:59 時 | axis 末端為 `2026-04`（與 04-30 中午行為一致） |
| `buildQuarterlyAxis` incomeQ 有 8 季時 | 回傳最近 6 季，由舊到新 |
| `checkS11Quarterly` 對 6 個不同季的 axis | 6 格 `label` 為「2024Q3」「2024Q4」…等季字串，**不是** `2024-09` 月字串 |
| `computeRuleAlerts` recentPeriods 對 S10 與 S11 | S10 6 格為 6 個不同月、S11 6 格為 6 個不同季 |
| `computeRuleAlerts` 回傳的 `recentPeriodScores` | 6 筆且每筆 `label` 為可解析的 `YYYY-MM`（月頻 axis），不會跑出季字串 |
| `computePeriodScores` (K 線 overlay) 月份維度仍包含季規則 | 同月內季規則保留原 quarter snapshot 行為 |

新增 `tests/ticker_resolver.test.js`：

| 用例 | 期望 |
|------|------|
| `resolveTickerInput("2330")` | `"2330"` |
| `resolveTickerInput("台積電")`（mock holdingData 含 2330） | `"2330"` |
| `resolveTickerInput("台積")` 唯一前綴匹配 | `"2330"` |
| `resolveTickerInput("光")` 多筆匹配 | `null` |
| `resolveTickerInput("不存在的名字")` | `null` |
| `resolveTickerInput("")` | `null` |
| `resolveTickerInput("0050")` | `"0050"` |
| `resolveTickerInput("00878")` | `"00878"`（5 碼 ETF） |
| 第一次 ensureLoad 回 `{status:"failed"}` → resolve 名稱回 `null` ；接著 reset + ensureLoad 回 `{status:"loaded"}` 再 resolve 同名稱 | 第二次能正確回代號（**證明 failed 沒被快取**） |
| 第一次 ensureLoad 回 `{status:"pending"}`（理論上 ensureLoad 自己會等到 settled，但保險起見） | 不快取，下次再試 |

新增 `tests/search_controller.test.js`（race-safe 排程；測 `createSearchController` 純函式，不需 DOM）：

| 用例 | 期望 |
|------|------|
| 連續呼叫 `submit("2")` `submit("23")` `submit("233")` `submit("2330")`（fake timer，resolver 各延遲 50ms） | 最後只觸發一次 `onResolved("2330")` |
| `submit("2330")` 後 100ms 內 `submit("台積電")` | 只觸發一次 `onResolved("2330")`，舊的 resolve 被 sequence id 丟棄 |
| `submit("")` 或 invalid 輸入 → 必須重置 timer | 上一次 valid 排程不再觸發 `onResolved` |
| resolver throw exception | 觸發 `onHint(找不到...)`，不 unhandled rejection |
| `cancel()` 後再 `submit` | 既有 in-flight 的 await 全部作廢，只跑新的 |
| 解析後 `onResolvedRewrite` 在 `onResolved` 之前被呼叫 | `tickerInput.value` 在 `search()` 啟動前已被改成代號 |

不寫 `tests/main_search.test.js`：[`tests/dom_smoke.test.js`](../../tests/dom_smoke.test.js) 現況只是讀靜態 HTML/CSS + 一個 `getElementById`-only 的 mock document，**沒有 JSDOM、沒有載入 `main.js`、沒有 dispatch event**。把 controller 抽成依賴注入的純模組後，main.js 的 wiring 只剩「把使用者事件導到 `searchController.submit(input.value)`」這幾行 ─ 用人眼 review + Step E 的 preview 手動驗收即可，不為它新增 JSDOM 或重型 e2e 設定。

`tests/dom_smoke.test.js` 補一條**靜態** smoke（與既有風格一致，純字串比對 HTML）：

```js
assert.match(html, /id="search-hint"[^>]*aria-live="polite"/);
assert.match(html, /placeholder="輸入股票代號或名稱[^"]*"/);
assert.match(html, /<label[^>]*for="ticker-input"[^>]*>股票代號或名稱</);
```

這樣只驗 markup 契約，不騙讀者以為它驗了 wiring。

`stock_summary.test.js`、`rule_alerts.test.js`、`kline.test.js` 跑回歸，確認：
* 股票摘要警示分數在月規則 latest 變成 2026-04 後不再被低估。
* `kline.test.js` 對 overlay 落點的契約仍然成立（只是右側少一個月的點）。

### Step E ─ 端到端驗收（手動）

在 dev preview（`mcp__Claude_Preview__preview_*`）依序：

1. 查 1101，確認：
   * 規則表月規則 6 欄 = 2025-11 ~ 2026-04（不再有 2026-05）
   * 規則表季規則 6 欄 = 6 個不同季度（最新為 2025Q4）
   * 股票摘要的「警示分數」不再顯示「資料不足」
   * K 線 overlay 黃線最新點移到 2026-04 的月底
2. 查 2330，做相同檢查（確認非景氣循環股不會破例）
3. 搜尋框輸入「台泥」→ 自動帶到 1101 並渲染同一份畫面，搜尋框文字回填為 `1101`
4. 輸入「光」→ 顯示「找不到對應股票」的提示，不發 API
5. 輸入空字串送出 → 不發 API，無錯誤

---

## 四、檔案改動清單

| 檔案 | 變更 |
|------|------|
| `js/lib/rule_engine.js` | 新增 `taipeiDateIso` / `taipeiMonthKey` / `lastDayIsoOfMonth` / `isMonthClosed` / `buildQuarterlyAxis` / `axisDisplayLabel` / `checkS11Quarterly` / `checkS12Quarterly` / `checkS13Quarterly`；`buildMonthEndAxis(quotes, today?)` 改用 `isMonthClosed` 過濾；`computeRuleAlerts({ ..., today })` 接收 `today` 並傳給兩個 axis builder；每條 rule 同時帶 `periods`（月頻 overlay）與 `displayPeriods`（季規則用季頻、月規則為 undefined）；`recentPeriods` 季規則改取 displayPeriods；`recentPeriodScores` 改用 `padOldestFirst(rule.periods)`（強制走月頻 axis） |
| `js/modules/rule_alerts.js` | `normalizePeriods` 優先吃 `recentPeriods`（既有行為），不需大改 |
| `js/main.js` | import + 接 `createSearchController(...)`；submit/click 改成呼叫 `searchController.submit(tickerInput.value)`（**外層仍是普通 function，不是 async**）；`computeRuleAlerts({ ..., today: new Date() })`（顯式注入便於測試）；移除舊的 `debouncedSearch` closure |
| `js/lib/ticker_resolver.js` | **新檔**，名稱 → 代號解析；只在 `state.status === "loaded"` 時快取 index |
| `js/lib/search_controller.js` | **新檔**，race-safe debounce + sequence id，依賴注入便於單元測試 |
| `index.html` | placeholder / aria-label 文案改成「股票代號或名稱」；加 `<div id="search-hint" aria-live="polite">`；可選加 `<datalist id="ticker-suggestions">` |
| `tests/rule_engine.test.js` | 新增 Taipei 時區 / 月底邊界 / 季頻 axis / 季規則 6 季展開 / `recentPeriodScores` 仍為月頻的用例 |
| `tests/ticker_resolver.test.js` | **新檔**，含「failed 不快取，下次成功時可恢復」 |
| `tests/search_controller.test.js` | **新檔**，race / cancel / rewrite 順序 |
| `tests/stock_summary.test.js` | 新增「月規則 latest 不在當月」的回歸 |
| `tests/kline.test.js` | 既有用例放寬：overlay 末點允許不是當月（接受「最近完整月」） |
| `tests/dom_smoke.test.js` | 新增**靜態** smoke：HTML 內容含 `id="search-hint" aria-live="polite"`、placeholder 與 label 文案改成「股票代號或名稱」（純字串比對，不驗 wiring） |

---

## 五、風險與相容性

* **K 線 overlay 點數變化**：右側少一個 NA 點，視覺差異極小，不破壞 lightweight-charts 的渲染契約。
* **季規則 displayPeriods 與 K 線 overlay 不一致**：刻意設計 ─ 規則表追求「6 個不同季的歷史對照」，K 線追求「每月有一個分數」。兩者解耦不互相影響。
* **`recentPeriodScores` 改回月頻語意**：見 Step B step 6 方案 A。現有兩個 test 只 assert `length === 6`，不 assert 數值，相容。未來若有人讀 cell 數值會拿到月頻 axis 上的 score，與 K 線 overlay 同維度，符合預期。
* **CSV 載入失敗時的搜尋**：`resolveTickerInput` 會降級成「只認純數字代號」，原行為不退化（仍可輸入 `2330`）。
* **時區**：全部 axis 比對改用 `Asia/Taipei`，由 `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" })` 產生 ISO key（en-CA locale 在標準 Node 與所有 evergreen 瀏覽器都支援，已在專案 vendor lightweight-charts 4 環境驗證）。Node 18+ 預設打包 full ICU，無需額外安裝。
* **盤中查當月**：在台北月底當天（例如 2026-04-30 14:00）查詢，4 月會被保留 → UI 顯示 4 月為最新欄；若 monthsales/incomeQ 該月仍未發佈，cell 會是 NA，這是資料端訊號，不是 axis bug。

---

## 六、執行順序建議

1. Step A（最小改動，立即解 Bug 1） + 對應測試 + preview 驗收
2. Step B（季頻 axis 拆分） + 對應測試 + preview 驗收（與 Step A 不衝突）
3. Step C（中文名稱搜尋） + 對應測試 + preview 驗收（獨立功能）
4. 最後一次跑 `npm test` 全套回歸，commit 三筆 commit（A/B/C 各一筆，方便 review）。
