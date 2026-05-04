# 前端版面調整計畫（2026-05-04）

> **分支**：`feature/layout-claude`
> **Worktree**：`/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov`
> **範圍**：5 項版面 / 顯示格式調整，不涉及資料抓取或商業邏輯

---

## 一、需求總覽

| # | 區塊 | 變更類型 | 風險 |
|---|------|---------|------|
| 1 | 第一頁區塊順序 | HTML 重排 | 低 |
| 2 | 股權分散表（近 12 週） | 新增 3 欄變化量 | 中 |
| 3 | 季度財務（近 8 季） | 年季欄位格式化 | 低 |
| 4 | 月營收 / 公司治理 | 年月欄位格式化 | 低 |
| 5 | 風險與技術面 | 表頭文字變更 | 極低 |

---

## 二、現況確認

### 2.1 目前資料原始格式（資料來源 CMWebAPI）

| 欄位 | API 範例值 | 期望顯示 |
|------|-----------|---------|
| `年月` | `"202603"` | `2026-03` |
| `年季` | `"202504"` | `2025Q4` |
| `日期` | `"2026-03-15"` | （沿用，已有橫線） |

> 註：`年季` 末兩碼 `01..04` 對應 Q1..Q4，依 `docs/audit/2026-04-17-api-units-reference.md` 與 `docs/audit/2026-04-17-frontend-audit.md` 已確認。

### 2.2 受影響檔案

```
index.html                              （變更 1）
js/utils.js                             （新增 2 個格式化工具函式）
js/modules/shareholders.js              （變更 2 + 修正 mid 多餘依賴）
js/modules/valuation.js                 （變更 3）
js/modules/revenue.js                   （變更 4）
js/modules/insider_governance.js        （變更 4）
js/modules/risk_technical.js            （變更 5）
tests/utils.test.js                     （擴充：新增 formatYearMonth/Quarter 測試）
tests/dom_smoke.test.js                 （必改：L74-79 區塊順序斷言）
tests/valuation.test.js                 （改可見文字斷言 202504 → 2025Q4，保留 join key 用原始字串）
tests/revenue.test.js                   （改可見文字斷言 202603/202504 → 2026-03/2025-04）
tests/presentation_consistency.test.js  （擴充股權分散 4 欄變化量斷言）
```

---

## 三、變更詳述

### 變更 1 — 第一頁區塊順序

**目前順序**（[index.html:62-109](index.html)）：

1. `section-profile` — 個股資訊
2. `section-kline` — K 線圖
3. `section-stock-summary` — 股票摘要
4. `section-rule-alerts` — 即時規則警示

**目標順序**：

1. `section-profile` — 個股資訊
2. **`section-rule-alerts`** — 即時規則警示
3. `section-stock-summary` — 股票摘要
4. **`section-kline`** — K 線圖

**作法**：

- 直接在 `index.html` 內把整段 `<section id="section-rule-alerts">` 區塊上移至 `section-profile` 之後；`section-kline` 區塊下移至 `section-stock-summary` 之後。
- 同步更新該段註解（目前有 `Section 1.5 (MOVED)`、`Section 1.6`、`Section 1.7` 等標記）以反映新順序。
- 不變更 `id` 名稱、CSS class、JS 綁定，只動 DOM 順序。
- 檢視 `js/main.js` 是否有依 DOM 順序假設（例如 `querySelectorAll` 後依索引取值）。預期應全為 `getElementById`，無需更動。
- **必改測試 [tests/dom_smoke.test.js:61-83](tests/dom_smoke.test.js)**：該測試以 `indexOf` 比對位置，硬性要求 `profile < kline < summary < ruleAlerts < strategy`。本變更後須調整為 `profile < ruleAlerts < summary < kline < strategy`，並更新測試名稱「places stock summary between K line and standalone rule alerts」為新順序語意。同時保留 `assert.equal(incomeStart, -1)` 與 `rule-alerts-container` 子節點檢查。

**驗收**：頁面渲染後，從上而下依序為「個股資訊 → 即時規則警示 → 股票摘要 → K 線」。所有區塊仍可正常載入資料。`tests/dom_smoke.test.js` 通過。

---

### 變更 2 — 股權分散表新增 3 欄週變化量

**現況**（[js/modules/shareholders.js](js/modules/shareholders.js)）：
- 僅 `1000張以上` 顯示週變化量（與前一筆比較的 ppt 差，含 `+/-` 與顏色）。
- `400張以上`、`100~400張`、`100張以下` 只有當週數值。
- **附帶 bug**：[shareholders.js:40-43](js/modules/shareholders.js) 的 `mid` 計算多了 `big1000 != null` 條件，但公式 `100 - above400 - below100` 不依賴 `big1000`，造成當 `big1000` 缺值時中段值無法計算的虛假耦合。

**做法**：

1. **修正 mid 公式多餘依賴**：把 current/prev 的 `mid` 都改成只依賴 `above400` 與 `below100`：
   ```js
   const midOf = (a400, b100) =>
     a400 != null && b100 != null ? Math.max(0, 100 - a400 - b100) : null;
   ```
2. 抽出 helper（檔內 local，不外露）統一 4 欄渲染：
   ```js
   const cell = (value, chg) => `
     <td>
       ${formatPercent(value)}
       ${chg != null
         ? `<span class="text-xs ${valClass(chg)}">${signStr(chg)}${Math.abs(chg).toFixed(2)}</span>`
         : ""}
     </td>`;
   const diff = (cur, prev) =>
     cur != null && prev != null ? cur - prev : null;
   ```
3. 在 `map` 內計算 4 欄當週值與週變化：
   ```js
   const big1000 = d["1000張以上佔集保比率"];
   const above400 = d["400張以上佔集保比率"];
   const below100 = d["100張以下佔集保比率"];
   const mid = midOf(above400, below100);

   const prev = sorted[i + 1];
   const big1000Chg = diff(big1000, prev?.["1000張以上佔集保比率"]);
   const above400Chg = diff(above400, prev?.["400張以上佔集保比率"]);
   const below100Chg = diff(below100, prev?.["100張以下佔集保比率"]);
   const midChg = diff(
     mid,
     midOf(prev?.["400張以上佔集保比率"], prev?.["100張以下佔集保比率"]),
   );
   ```
4. **邊界**：第 12 週（`sorted` 最末筆）`prev` 為 `undefined`，`diff` 回傳 `null`，UI 不顯示變化量。

**驗收**：
- 4 欄都顯示週變化量；最舊一筆 4 欄都不顯示變化量。
- 漲跌色（`valClass`）與既有規則一致。
- `big1000` 缺值時，`mid` 仍可正確計算（修正前的虛假耦合已移除）。

---

### 變更 3 — 季度財務年季欄位格式化

**現況**：[js/modules/valuation.js:77](js/modules/valuation.js) 直接渲染 `r.quarter`，輸出 `202504`，使用者誤以為是年月。

**目標**：顯示 `2025Q4`。

**做法**：

1. 在 `js/utils.js` 新增可重用工具函式：

   ```js
   /**
    * 將 API 回傳的 6 碼年季字串轉為 YYYYQ# 格式。
    * @example formatYearQuarter("202504") // "2025Q4"
    * @param {string|number|null|undefined} v
    * @returns {string} `null` / `undefined` 回傳空字串；非預期格式（長度不符、非數字、季別越界）原樣返回
    */
   export function formatYearQuarter(v) {
     if (v == null) return "";
     const s = String(v);
     if (!/^\d{6}$/.test(s)) return s; // 已格式化或非預期格式時原樣返回
     const year = s.slice(0, 4);
     const q = Number(s.slice(4, 6));
     if (q < 1 || q > 4) return s;
     return `${year}Q${q}`;
   }
   ```
2. `js/modules/valuation.js` 引入並套用：
   ```js
   import { ..., formatYearQuarter } from "../utils.js";
   ...
   <td>${escapeHtml(formatYearQuarter(r.quarter))}</td>
   ```
3. **不要**動 `bsMap[row["年季"]]` 的鍵（仍用原始 `202504`），只在顯示層轉換。
4. **本次範圍僅限 `valuation.js`「季度財務」區塊**。其他模組（`cashflow.js`、`financial_ratios.js`、`income.js` 等）若也直接顯示 `202504`，列為 follow-up PR，不混入本次變更（避免測試擴大、降低 review 成本）。

**驗收**：表格年季欄顯示 `2025Q4`、`2025Q3`...，原始排序（`sortDescByKey(..., "年季")`）不受影響。

---

### 變更 4 — 月營收 / 公司治理年月欄位格式化

**現況**：
- [js/modules/revenue.js:83](js/modules/revenue.js)：`<td>${escapeHtml(d["年月"] || "")}</td>` → 顯示 `202603`
- [js/modules/insider_governance.js:75](js/modules/insider_governance.js)：`<td>${escapeHtml(r["年月"] ?? "")}</td>` → 顯示 `202603`

**目標**：顯示 `2026-03`。

**做法**：

1. 在 `js/utils.js` 新增：
   ```js
   /**
    * 將 API 回傳的 6 碼年月字串轉為 YYYY-MM 格式。
    * @example formatYearMonth("202603") // "2026-03"
    * @param {string|number|null|undefined} v
    * @returns {string} `null` / `undefined` 回傳空字串；非預期格式（長度不符、非數字、月份越界）原樣返回
    */
   export function formatYearMonth(v) {
     if (v == null) return "";
     const s = String(v);
     if (!/^\d{6}$/.test(s)) return s;
     const month = Number(s.slice(4, 6));
     if (month < 1 || month > 12) return s; // 月份越界 → 原樣返回，不偽造 2026-13
     return `${s.slice(0, 4)}-${s.slice(4, 6)}`;
   }
   ```
   **理由**：與「非預期輸入原樣返回」設計取捨一致，避免 `"202613"` 被顯示成具誤導性的 `2026-13`。
2. 兩個模組各自 import `formatYearMonth` 並包住現有顯示位置：
   - `revenue.js`：`<td>${escapeHtml(formatYearMonth(d["年月"]))}</td>`
   - `insider_governance.js`：`<td>${escapeHtml(formatYearMonth(r["年月"]))}</td>`
3. 排序仍用原始 `年月` 字串（字典序與數值序一致），無需額外處理。

**驗收**：兩個區塊年月欄都顯示 `2026-03` 樣式；排序仍由新到舊。

---

### 變更 5 — 風險與技術面表頭

**現況**：[js/modules/risk_technical.js:93](js/modules/risk_technical.js) `<th>月份</th>`，值為 `String(r["日期"] ?? "").slice(0, 7)` → `2026-03`（已有橫線）。

**做法**：將表頭文字 `月份` 改為 `年月`。值的渲染不動。

**驗收**：表頭顯示「年月」，下方資料維持 `YYYY-MM` 格式。

---

## 四、共用工具：`js/utils.js` 新增

集中於 `utils.js` 之單一位置，作為所有日期格式化的入口；維持現有 `shortDate` 不動以避免影響其他呼叫點。

```js
export function formatYearMonth(v) { /* see §變更 4 */ }
export function formatYearQuarter(v) { /* see §變更 3 */ }
```

**設計取捨**：
- 不額外做 i18n / locale；僅處理目前 API 的 6 碼格式。
- 非預期輸入（長度不對、含非數字）時原樣返回，避免破壞既有頁面。
- 不更動既有資料結構 / 排序鍵。

---

## 五、測試計畫

> **測試風格**：repo 統一使用 `node:test + node:assert/strict`（見 [tests/utils.test.js:1-2](tests/utils.test.js)）。**不**使用 `describe/it/expect`。新測試一律以扁平 `test("...", () => { assert.equal(...) })` 結構撰寫。

### 5.1 擴充 `tests/utils.test.js`（不新增檔案）

在現有檔末追加，import 從 `../js/utils.js` 補入 `formatYearMonth`、`formatYearQuarter`：

```js
// --- formatYearMonth ---

test("formatYearMonth converts 202603 → 2026-03", () => {
  assert.equal(formatYearMonth("202603"), "2026-03");
});

test("formatYearMonth accepts numeric input", () => {
  assert.equal(formatYearMonth(202603), "2026-03");
});

test("formatYearMonth returns empty for null/undefined", () => {
  assert.equal(formatYearMonth(null), "");
  assert.equal(formatYearMonth(undefined), "");
});

test("formatYearMonth returns input as-is for non-6-digit values", () => {
  assert.equal(formatYearMonth("2026-03"), "2026-03");
  assert.equal(formatYearMonth("20260"), "20260");
});

test("formatYearMonth returns input as-is for out-of-range months", () => {
  assert.equal(formatYearMonth("202613"), "202613"); // 月份 13 → 不偽造
  assert.equal(formatYearMonth("202600"), "202600"); // 月份 0 → 不偽造
});

// --- formatYearQuarter ---

test("formatYearQuarter converts 202504 → 2025Q4", () => {
  assert.equal(formatYearQuarter("202504"), "2025Q4");
});

test("formatYearQuarter handles Q1..Q4", () => {
  assert.equal(formatYearQuarter("202501"), "2025Q1");
  assert.equal(formatYearQuarter("202503"), "2025Q3");
});

test("formatYearQuarter returns input as-is for invalid quarter", () => {
  assert.equal(formatYearQuarter("202505"), "202505");
  assert.equal(formatYearQuarter("202500"), "202500");
  assert.equal(formatYearQuarter("2025Q4"), "2025Q4");
});

test("formatYearQuarter returns empty for null/undefined", () => {
  assert.equal(formatYearQuarter(null), "");
  assert.equal(formatYearQuarter(undefined), "");
});
```

### 5.2 既有模組測試必改

#### `tests/valuation.test.js`
- 將 `assert.match(container.innerHTML, /202504/)`（如 L48）改為 `assert.match(container.innerHTML, /2025Q4/)`。
- 既有測試（如 `renderValuation joins quarterly income with balance sheet on 年季` 一類餵入 `年季: "202504"` 至 income+bs 並斷言對應 `每股淨值` 出現於輸出的測試）即已涵蓋 join 行為。**不再新增 placeholder 測試**；僅把該組測試裡的可見文字斷言由 `/202504/` 改為 `/2025Q4/`，單一測試即同時驗證 join key（原始 6 碼）與顯示層（`YYYYQ#`）。

#### `tests/revenue.test.js`
- L84-85 `assert.match(container.innerHTML, /202603/)`、`/202504/` → 改為 `/2026-03/`、`/2025-04/`。
- 排序輸入仍用 `年月: "202603"` 等原始字串（驗證排序不受顯示層影響）。

### 5.3 擴充 `tests/presentation_consistency.test.js`

於既有 `shareholder change cues...` 測試（L55-82）擴充：

- 餵入資料補齊 `1000張以上佔集保比率`（已有），並設計 4 欄都有可觀察的週變化（包含正負）。
- 增加斷言：
  ```js
  // 4 欄都顯示週變化量（正負皆涵蓋）
  assert.match(html, /\+0\.08/);   // 1000張以上 ↑
  assert.match(html, /\+0\.05/);   // 400張以上  ↑（範例值）
  assert.match(html, /-0\.10/);    // 100張以下  ↓
  assert.match(html, /-0\.03/);    // 100~400   ↓（推算後）
  ```
- 加一筆「最舊一週無 prev」案例：傳入 1 筆資料，斷言 `html` 不含任何 `+/-` 變化量 span。

### 5.4 必改 `tests/dom_smoke.test.js`

[tests/dom_smoke.test.js:61-83](tests/dom_smoke.test.js) 需把硬編碼順序

```js
assert.ok(klineStart > profileStart);
assert.ok(summaryStart > klineStart);
assert.ok(ruleAlertsStart > summaryStart);
assert.ok(strategyStart > ruleAlertsStart);
```

改為新順序：

```js
assert.ok(ruleAlertsStart > profileStart);
assert.ok(summaryStart > ruleAlertsStart);
assert.ok(klineStart > summaryStart);
assert.ok(strategyStart > klineStart);
```

並更新 test 名稱描述為新順序（例如 `"index.html orders sections: profile → rule alerts → summary → kline → strategy scores"`）。`assert.equal(incomeStart, -1)` 與 `rule-alerts-container` 子節點檢查保留。

### 5.5 治理 / 風險區塊測試

掃 `tests/` 確認是否已有：
- `renderInsiderGovernance` 測試 — 若無，**不**強制本次新增（範圍控管），但若有任何相關斷言含 `年月` 顯示文字，需同步改為 `YYYY-MM`。
- `renderRiskTechnical` 測試 — 同上規則；若需新增最小斷言，加一條檢查表頭 `<th>年月</th>` 即可。

### 5.6 視覺驗證（取代 preview_*）

repo 沒有 dev-server 設定，改用本地靜態伺服器 + 瀏覽器自動化：

```bash
cd /Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov
python3 -m http.server 8000 --bind 127.0.0.1
```

然後以 `mcp__claude-in-chrome` 或 Playwright 開啟 `http://127.0.0.1:8000/` 查詢 `2330`，逐一驗證：

- 第一頁 4 區塊新順序
- 股權分散表 4 欄變化量
- 季度財務年季欄顯示 `YYYYQ#`
- 月營收年月欄顯示 `YYYY-MM`
- 公司治理年月欄顯示 `YYYY-MM`
- 風險技術面表頭為「年月」
- DevTools console 無 JS 錯誤

### 5.7 驗收清單

- [ ] 區塊順序：個股資訊 → 即時規則警示 → 股票摘要 → K 線
- [ ] `tests/dom_smoke.test.js` 順序斷言已更新並通過
- [ ] 股權分散：4 欄都顯示週變化量、最舊一週無變化量、漲跌色正確
- [ ] `shareholders.js` `mid` 公式不再依賴 `big1000`
- [ ] `presentation_consistency.test.js` 4 欄變化量斷言齊備
- [ ] 季度財務：年季顯示 `YYYYQ#`，`tests/valuation.test.js` 通過
- [ ] 月營收：年月顯示 `YYYY-MM`，`tests/revenue.test.js` 通過
- [ ] 公司治理：年月顯示 `YYYY-MM`
- [ ] 風險與技術面：表頭顯示「年月」
- [ ] `formatYearMonth("202613")` 回傳 `"202613"`（非 `"2026-13"`）
- [ ] `npm test` 全綠
- [ ] 頁面 console 無錯誤
- [ ] CSP 未變、無新引入第三方資源

---

## 六、風險與回退

| 風險 | 機率 | 影響 | 緩解 |
|------|------|------|------|
| `年月` / `年季` API 偶有非 6 碼字串 | 低 | 中 | 格式化函式對非預期輸入原樣返回 |
| 區塊重排破壞 main.js render 順序 | 低 | 中 | render 全為 `getElementById`，與 DOM 順序無耦合；以 preview 視覺驗證 |
| 股權分散最舊週無 prev 造成 NPE | 低 | 低 | 既有 `1000張以上` 已正確處理 `null`；新增三欄沿用相同樣板 |
| 既有測試硬編碼舊文字 | 中 | 低 | 5.2 主動巡檢相關測試 |

**回退**：本次所有變更皆為純前端展示層，無資料層 / API / state 結構變動。任一步驟若出現錯誤，可單獨 revert 對應檔案；建議分 5 個 commit（每個變更一個）以利精準回退。

---

## 七、提交策略

建議 5 個 atomic commit（依 `~/.claude/rules/git-workflow.md`）：

1. `refactor: extract formatYearMonth & formatYearQuarter helpers`
2. `feat(layout): reorder first-page sections (alerts before kline)`
3. `feat(shareholders): show week-over-week change for all 4 buckets`
4. `style(valuation): render quarter as YYYYQ# instead of raw 年季 code (e.g., 202504)`
5. `style(revenue,governance,risk): render year-month as YYYY-MM`

每個 commit 各自附帶 / 更新對應測試，跑過 `npm test` 後再提交下一個。

---

## 八、不在本次範圍（明確 follow-up）

**Follow-up（建議另開 PR，不混入本次）**：
- `cashflow.js`、`financial_ratios.js`、`income.js` 等其他可能顯示原始 `年季` 6 碼的模組 → 套用 `formatYearQuarter` 達成全頁一致。本次只動「季度財務」(`valuation.js`)。
- 其他可能顯示原始 `年月` 6 碼的模組（若有）→ 套用 `formatYearMonth`。

**完全不在範圍**：
- 任何資料抓取邏輯、API 端點、欄位重命名
- CSS 主題 / 配色 / 字型
- 響應式斷點 / RWD 行為調整
- 新增 `renderInsiderGovernance` / `renderRiskTechnical` 完整測試套件（若目前不存在）
