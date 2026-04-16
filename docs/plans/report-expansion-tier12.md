# 壽險投資部報表 — Tier 1 + Tier 2 實作計畫

## Context（背景）

`feature/layout-claude` 分支已完成一頁式報表雛形，但僅涵蓋 9 / 19 張 Dottdot 資料表，壽險投資部最關切的 **現金流、財務比率、風險指標、公司治理、長期趨勢** 五大面向尚缺。

使用者已決定：**採納 Tier 1（3 區塊）+ Tier 2（2 區塊），共新增 5 個報表區塊**。本文件規劃其實作。

篩選邏輯與排除項目見上一版分析；此版聚焦實作步驟。

### 順帶修正的既有 bug

實作過程會順手修正既有缺陷：

1. **股利資料表頻率誤解**：`md_cm_ot_dividendpolicy` 是**季頻（`年季`）**而非年頻。現有 [js/api.js](../../js/api.js) `fetchDividendPolicy` 只抓 10 筆 ≈ 2.5 年，但 [index.html](../../index.html) 標為「近 10 年」、[js/modules/dividend.js](../../js/modules/dividend.js) 又把季資料當年資料攤列 → 標題與內容不符。
   - 新增 `js/lib/dividend_aggregator.js` 做季→年彙總（只輸出可加總的量：年度現金股利、年度股票股利、年度合計；**不輸出殖利率、發放率**，避免把單季比率混進年度列 — 比率由 consumer 用年末收盤價、年度 EPS 自行重算）
   - 既有 dividend 區塊與新 long_term_trend 區塊共用此聚合器
   - `fetchDividendPolicy` `page_size` 10 → 40（覆蓋 10 年季資料）

2. **FCF 不自行推導**：`md_cm_fi_cf_quarterly` 已有官方 `自由現金流量` 欄位（見 field inventory 末段）。IFRS 的「投資活動現金流量」包含購買金融資產、子公司股權等非資本支出項目，特別是 2330 這類現金部位大的公司，`OCF + ICF` 會與真正 FCF 差到 100M+ 量級。**直接讀 API 欄位，不自行推導**。

---

## 新增 5 個區塊總覽

| # | 區塊 | 來源 Table | 新增 API | 新增 Module | 主要欄位/衍生 |
| --- | --- | --- | --- | --- | --- |
| 1 | 現金流摘要（8Q）| `md_cm_fi_cf_quarterly` | `fetchQuarterlyCashflow` | `js/modules/cashflow.js` | OCF / ICF / FCF_fin / FCF / 現金股利覆蓋 |
| 2 | 財務比率儀表板 | **衍生**（用既有 `is_quarterly` + `bs_quarterly` + 新 `cf_quarterly` + `dividend`）| — | `js/modules/financial_ratios.js` | ROE / ROA / 負債比 / 流動比 / 利息保障 / 股利覆蓋 |
| 3 | 風險與技術面 | `md_cm_ta_dailystatistics` | `fetchDailyStatistics` | `js/modules/risk_technical.js` | Beta / 波動度 / Alpha / 月 KD / 月 RSI / 乖離率 |
| 4 | 公司治理（12M）| `md_cm_fd_insiderholdingstructure` | `fetchInsiderStructure` | `js/modules/insider_governance.js` | 董監/經理人/大股東 持股比 + 設質比 |
| 5 | 5Y 長期趨勢 | `md_cm_fi_is_annual` + `md_cm_fi_bs_annual` | `fetchAnnualIncome` + `fetchAnnualBS` | `js/modules/long_term_trend.js` | 營收/EPS/股利/BV 5Y CAGR + ROE/ROA 5Y |

共：
- **5 個新 API fetcher** + 1 個既有 fetcher 調參（`fetchDividendPolicy` page_size 10→40）
- **5 個新 render module** + 1 個既有 module 修正（`js/modules/dividend.js` 改讀聚合後年度資料）
- **5 個新 HTML section** + 1 個既有 section 標題核對（`近 10 年` 需與聚合後真實年數一致）
- **1 個新 helper**：`js/lib/dividend_aggregator.js`（季→年聚合，兩個區塊共用）

---

## 實作步驟（建議順序）

### Step 1：新增 + 調整 API fetchers（[js/api.js](../../js/api.js)）

**修改**：將既有 `fetchDividendPolicy` 的 `page_size` 由 `10` 改為 `40`（10 年季資料），以支援聚合後的年度視圖。

**新增 5 個**：在 `api.js` 後段追加，沿用現有 `queryTable()` 慣例：

```js
// 新增：季度現金流量（8Q）
export function fetchQuarterlyCashflow(ticker, signal) {
  return queryTable("md_cm_fi_cf_quarterly", { ticker, page_size: 8 }, signal);
}

// 新增：每日技術統計（5Y，module 自行篩月頻值）
export function fetchDailyStatistics(ticker, signal) {
  return queryTable(
    "md_cm_ta_dailystatistics",
    { ticker, start: fiveYearsAgo(), end: today(), page_size: 1500 },
    signal,
  );
}

// 新增：內部人持股結構（近 12 個月）
export function fetchInsiderStructure(ticker, signal) {
  return queryTable(
    "md_cm_fd_insiderholdingstructure",
    { ticker, page_size: 12 },
    signal,
  );
}

// 新增：年度損益表
// page_size: 10 而非 6 的原因：除了算 5Y CAGR（需 6 筆），
// 還要為 dividend.js 年度「發放率」重算提供 10 年 EPS 覆蓋。
export function fetchAnnualIncome(ticker, signal) {
  return queryTable(
    "md_cm_fi_is_annual",
    { ticker, page_size: 10 },
    signal,
  );
}

// 新增：年度資產負債表
// page_size: 10 對齊 fetchAnnualIncome，避免 ROE/ROA 年度趨勢兩邊年份不齊。
export function fetchAnnualBS(ticker, signal) {
  return queryTable(
    "md_cm_fi_bs_annual",
    { ticker, page_size: 10 },
    signal,
  );
}
```

### Step 2：延伸 [js/main.js](../../js/main.js) 的 `tasks` 陣列

在 `search(ticker)` 內的 `tasks` 後面追加 5 筆：

```js
{ key: "cashflow",    fn: () => fetchQuarterlyCashflow(ticker, signal) },
{ key: "stats",       fn: () => fetchDailyStatistics(ticker, signal) },
{ key: "insider",     fn: () => fetchInsiderStructure(ticker, signal) },
{ key: "annualIs",    fn: () => fetchAnnualIncome(ticker, signal) },
{ key: "annualBs",    fn: () => fetchAnnualBS(ticker, signal) },
```

並於 Promise.allSettled 之後：

1. **先聚合股利季→年**：`const annualDiv = aggregateDividendsToAnnual(data.dividend?.data)`（呼叫新的 helper）
2. **既有 `renderDividend` 改新簽章**（修正既有 bug 且補算年度殖利率/發放率）：
   ```js
   renderDividend({
     annualDiv,                     // 10Y 年度股利金額
     quotes: data.quotes?.data,     // 5Y 日價：供年末收盤價→年度殖利率
     annualIs: data.annualIs?.data  // 10Y 已結年度損益：供歷史年度 EPS→發放率
   });
   ```
   **覆蓋範圍說明**：
   - **股利金額欄 10Y 完整**
   - **殖利率欄僅 5Y 有值**，older rows 顯示「—」（受 `fiveYearsAgo()` 日價範圍限制；擴大到 10Y 會讓 K 線資料翻倍，性價比低）
   - **發放率欄**：僅歷史已結年度有值（透過 `annualIs` 匹配該年度 EPS）；**當年未結年度顯示「—」並附 tooltip「年度財報尚未公布」**（不做 YTD 推估，避免未結年度的半年 EPS 配全年股利造成誤導）。例：在 2025Q3 股利已公告但 `is_annual` 最新仍是 2024 的時點，2025 列的發放率欄就是「—」
3. 新增 5 個 render try/catch 區段，遵循既有慣例（失敗時 `showError` 到對應容器 id）；其中 `renderFinancialRatios` 與 `renderLongTermTrend` 也吃 `annualDiv`

### Step 3：新增 HTML section 容器（[index.html](../../index.html)）

照現有區塊樣板（白底卡片 + h2 標題 + `*-container` div + skeleton loader）新增：

- `#cashflow-table-container` — 現金流摘要
- `#ratios-dashboard-container` — 財務比率儀表板
- `#risk-tech-container` — 風險與技術面
- `#governance-table-container` — 公司治理
- `#longterm-trend-container` — 5Y 長期趨勢

`main.js::resetSections()` 同步加上對應 skeleton 條目。

### Step 4：實作 5 個 render module

#### 4.1 `js/modules/cashflow.js` — Tier 1-A

```js
/**
 * 渲染 8Q 現金流摘要表
 * @param {Array<Object>} cfData    md_cm_fi_cf_quarterly 8 筆
 * @param {Array<Object>} annualDiv 由 dividend_aggregator 聚合後的年度股利
 */
export function renderCashflow(cfData, annualDiv) { ... }
```

欄位（**直接讀 API 欄位，不自行推導 FCF**）：
- `年季`、`營業活動現金流量`（OCF）、`投資活動現金流量`（ICF）、`融資活動現金流量`（FCF_fin）
- **`自由現金流量`**（API 官方欄位，位於 cf_quarterly 最末段；**不要用 `OCF + ICF`**，因 IFRS ICF 含購買金融資產等非 capex 項目，2330 抽樣顯示兩者可差 100M+ 量級）
- 衍生 **現金股利覆蓋倍數 = FCF_TTM / 最近年度現金股利發放**
  - `FCF_TTM = 最近 4 季 自由現金流量 加總`
  - `最近年度現金股利發放`：從 `annualDiv` 取最新年度的 `年度現金股利`

#### 4.2 `js/modules/financial_ratios.js` — Tier 1-B（純衍生，不打 API）

```js
/**
 * 從既有資料計算關鍵財務比率，顯示最新值 + 迷你趨勢
 * @param {Object} params
 * @param {Array<Object>} params.incomeQ   is_quarterly 8Q
 * @param {Array<Object>} params.bsQ       bs_quarterly 8Q
 * @param {Array<Object>} params.cfQ       cf_quarterly 8Q（提供官方 自由現金流量）
 * @param {Array<Object>} params.annualDiv 聚合後年度股利（來自 dividend_aggregator）
 */
export function renderFinancialRatios({ incomeQ, bsQ, cfQ, annualDiv }) { ... }
```

**6 個核心比率**（與 6 張卡對齊；所有除法用 `utils.js::safeDiv` 處理 0/NaN）：

| # | 比率 | 公式 | 資料來源 |
| ---: | --- | --- | --- |
| 1 | `ROE_TTM` | `母公司業主–稅後純益` TTM / avg(期初期末 `母公司業主權益`) | incomeQ + bsQ |
| 2 | `ROA_TTM` | `稅後純益` TTM / avg(期初期末 `資產總計`) | incomeQ + bsQ |
| 3 | 負債比 | `負債總計` / `資產總計`（最新季）| bsQ |
| 4 | 流動比 | `流動資產` / `流動負債` | bsQ |
| 5 | 利息保障倍數 | (`稅前純益` + `利息費用`) / `利息費用` | incomeQ |
| 6 | FCF 股利覆蓋率 | FCF_TTM / 最近年度現金股利發放 | cfQ 的 `自由現金流量` + annualDiv |

**設計決策**：
- 移除速動比（與流動比資訊重疊；壽險決策邊際價值低）
- FCF_TTM 用 API 的 `自由現金流量` 欄位 4Q 加總，**不自行推導**
- 年度股利用 `dividend_aggregator` 彙總的結果（非原始季資料）

呈現：6 張卡最新值 + 一行文字（例：負債比>50% 顯示警示色、利息保障<3x 警示、FCF 覆蓋率<1x 警示）。

#### 4.3 `js/modules/risk_technical.js` — Tier 1-C

欄位選用：
- 最新值卡片：`Beta係數250D`、`Beta係數65D`、`年化波動度250D`、`Alpha250D`、`乖離率250日`
- 12M 月頻率趨勢小表：`月K9`、`月D9`、`月RSI10`、`月MACD`（資料為日頻，取每月末筆即可）

```js
/**
 * @param {Array<Object>} statsData md_cm_ta_dailystatistics 1500 筆（5Y 日頻）
 */
export function renderRiskTechnical(statsData) { ... }
```

#### 4.4 `js/modules/insider_governance.js` — Tier 2-D

從 280 欄中只取：
- `年月`
- `董監持股比例`、`董監持股比例增減`
- `經理人持股比例`、`經理人持股比例增減`
- `大股東持股比例`、`大股東持股比例增減`
- `董監設質比例`、`經理人設質比例`、`大股東設質比例`（需先確認 field inventory 的確切欄位名，可能為 `董監設質張數` / `董監股權設質比例` 等變體）

呈現：12M 表格 + 最新設質比警示（>30% 紅字、>50% 加紅底）。

#### 4.5 `js/modules/long_term_trend.js` — Tier 2-E

```js
/**
 * @param {Array<Object>} annualIs  is_annual 近 6 年
 * @param {Array<Object>} annualBs  bs_annual 近 6 年
 * @param {Array<Object>} annualDiv 由 dividend_aggregator 聚合後的年度股利
 */
export function renderLongTermTrend(annualIs, annualBs, annualDiv) { ... }
```

計算：
- `CAGR(end, start, years) = (end / start) ^ (1/years) - 1`（`utils.js::cagr` 提供）
- 營收 CAGR（5Y）、EPS CAGR、**年度現金股利 CAGR**（用聚合後值，不用原始季資料）、每股淨值 CAGR
- 年度 ROE/ROA：直接以年度數字帶公式，畫 5 點折線

呈現：一排 4 個 CAGR 卡片 + 一張 5Y ROE/ROA 雙線折線圖（用 SVG 或 lightweight-charts line series）。

#### 4.6 `js/lib/dividend_aggregator.js` — 新增（共用聚合器）

**動機**：`md_cm_ot_dividendpolicy` 是季頻，既有 `dividend.js` 與新的 `financial_ratios.js`、`long_term_trend.js` 都需要「年度」股利資料。集中在一個 helper 避免重複邏輯。

```js
/**
 * 把季頻股利政策聚合成年度。
 *
 * 規則（只輸出可加總的量，不搬單季比率）：
 * - 以「所屬年度」為 key（從 `年季` 前 4 碼取得，或用 `年度` 欄位若存在）
 * - 年度現金股利 = 同年度所有季別的 `現金股利合計` 加總
 * - 年度股票股利 = 同年度所有季別的 `股票股利合計` 加總
 * - 年度股利合計 = 現金 + 股票
 * - 除息日：取當年最後一筆非空值（僅作顯示參考）
 *
 * 不輸出殖利率、發放率：這兩個比率在原表是「單季分子 ÷ 股價或 EPS」，
 * 直接搬到年度列會與加總後的股利金額語意不符（例如 2330 年度股利 22 元
 * 配上當季殖利率 0.4% 會看起來像錯值）。改由 consumer 自己用年度數字重算：
 *   - 年度現金殖利率 = 年度現金股利 / 年末收盤價（從 dailyquotes 找該年度最後一個交易日）
 *   - 年度發放率     = 年度現金股利 / 年度 EPS（從 is_quarterly 4Q 加總或 is_annual）
 *
 * @param {Array<Object>|null} quarterlyData 來自 md_cm_ot_dividendpolicy
 * @returns {Array<{ 年度: string, 年度現金股利: number, 年度股票股利: number,
 *                   年度股利合計: number, 除息日: string|null }>}
 *          由新到舊排序
 */
export function aggregateDividendsToAnnual(quarterlyData) { ... }
```

**Consumer 端補算規則**（避免 aggregator 有 data fetching 相依）：

| Consumer | 需要的比率 | 補算公式 | 需要的額外資料 | 可覆蓋年數 |
| --- | --- | --- | --- | ---: |
| `dividend.js` | 年度現金殖利率 | 年度現金股利 / 年末收盤價 | `quotes`（`fiveYearsAgo()` 限制）| **5Y**（older rows 顯示「—」）|
| `dividend.js` | 年度發放率（已結年度）| 年度現金股利 / 年度 EPS | `annualIs`（page_size: 10）| 歷史 10Y |
| `dividend.js` | 年度發放率（未結年度）| — 不推估 | — | 顯示「—」+ tooltip「年度財報尚未公布」|
| `cashflow.js` | — | 只需年度現金股利量 | — | 10Y |
| `financial_ratios.js` | — | 只需年度現金股利量 | — | 10Y |
| `long_term_trend.js` | — | 只需年度現金股利量（算 CAGR，用最近 5Y）| — | 10Y（只用 5Y）|

**Graceful degradation**：`dividend.js` 渲染 10 年股利時，年份早於 quotes 範圍的殖利率欄填「—」並附 title tooltip「資料範圍限制」；**不要因此把整張表縮成 5Y**，年度股利金額仍是主要資訊、10Y 完整提供。

**調用者**：
- [js/modules/dividend.js](../../js/modules/dividend.js)（改吃年度資料、年末收盤價補算殖利率/發放率；修正標題不符的 bug）
- `js/modules/cashflow.js`（算 FCF 覆蓋率）
- `js/modules/financial_ratios.js`（FCF 股利覆蓋）
- `js/modules/long_term_trend.js`（現金股利 CAGR）

### Step 5：共用工具（[js/utils.js](../../js/utils.js)）

追加：

```js
/** @param {number} a @param {number} b @returns {number|null} */
export function safeDiv(a, b) {
  if (b === 0 || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a / b;
}

/** @param {number} end @param {number} start @param {number} years @returns {number|null} */
export function cagr(end, start, years) {
  if (!start || start <= 0 || years <= 0 || !Number.isFinite(end)) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

/** 取陣列中位數／平均／期末值便利函式；格式化百分比、倍數 */
```

### Step 6：欄位名稱驗證（✅ 已完成）

**驗證結果**（2026-04-15，透過 field inventory + live API `2330` 抽樣）：

**財報類（注意與直覺命名不同）：**
- 損益表：`稅前純益`、`稅後純益`（**非**「稅前淨利/稅後淨利」）、`母公司業主–稅後純益`（破折號為全形「–」U+2013）、`營業收入淨額`、`營業利益`、`利息費用`、`每股稅後盈餘`、`原始每股稅後盈餘`（更精確）
- 資產負債表：`資產總計`、`負債總計`、`權益總計`、`母公司業主權益`（**用這個算 ROE**，與 EPS 配對）、`流動資產`、`流動負債`、`存貨`
- 現金流量表：`營業活動現金流量`、`投資活動現金流量`、`融資活動現金流量`、**`自由現金流量`**（API 官方欄位，2330 2025Q4 驗證：OCF+ICF≈360M vs API 自由現金流量=360M，但早季差異可達 100M+）

**內部人設質（88 個設質相關欄位，直接命中 plan 規劃）：**
- `董監設質比例` / `董監設質比例增減`
- `經理人設質比例` / `經理人設質比例增減`
- `大股東設質比例` / `大股東設質比例增減`

**技術指標（68 欄）：**
- `Beta係數250D` / `Beta係數65D` / `Beta係數21D`
- `年化波動度250D` / `年化波動度21D`
- `Alpha250D`
- `月K9` / `月D9` / `月RSI10` / `月MACD` / `月DIF減月MACD`
- `乖離率250日` / `乖離率60日` / `乖離率20日`

**關鍵提醒**：JS 端 key 讀取要用 Unicode 精準匹配，特別是 `母公司業主–稅後純益` 的 `–`（en dash）；建議在 `utils.js` 加 `const FIELD = { NI_PARENT: "母公司業主–稅後純益", ... }` 集中管理，避免手打錯字。

---

## Critical files 清單

**需修改：**
- [index.html](../../index.html) — 新增 5 個 section 容器；核對既有股利區塊「近 10 年」標題是否與聚合後年數一致
- [js/api.js](../../js/api.js) — 新增 5 個 fetchers、**`fetchDividendPolicy` page_size 10 → 40**
- [js/main.js](../../js/main.js) — 延伸 tasks + render 調度 + skeleton；呼叫 `aggregateDividendsToAnnual` 後分派給 4 個消費者
- [js/modules/dividend.js](../../js/modules/dividend.js) — **修正既有 bug**：改吃年度聚合資料、新增 `quotes` + `annualIs` 參數；不再使用 `年季` 攤列；年份超過 5Y quotes 範圍的殖利率欄顯示「—」；當年未結年度（`annualIs` 查無）的發放率顯示「—」+ tooltip「年度財報尚未公布」
- [js/utils.js](../../js/utils.js) — 新增 `safeDiv`、`cagr`、格式化工具

**新增：**
- `js/lib/dividend_aggregator.js`（季→年彙總，4 個 module 共用）
- `js/modules/cashflow.js`
- `js/modules/financial_ratios.js`
- `js/modules/risk_technical.js`
- `js/modules/insider_governance.js`
- `js/modules/long_term_trend.js`

**不修改：**
- 既有 8 個 module（dividend.js 除外）
- `js/charts/kline.js`
- strategy CSV 相關邏輯

---

## 呈現風格對齊（延續現有設計）

- 沿用白底卡片 + 灰邊框 + h2 小節標題
- 表格：延續 valuation / income 的 zebra stripe
- 卡片：延續 profile/institutional 的數字 + 標籤 + 變化色
- 警示色：紅（惡化/警示）、綠（良好）、灰（中性）
- 行動裝置：保持現有 responsive 表格（overflow-x-auto）

---

## Verification（驗收）

### 人類可執行的驗收流程（primary）

本專案已有 [package.json](../../package.json) 與 [.claude/launch.json](../../.claude/launch.json)。推薦用既有設定：

```bash
# 從 worktree 根目錄啟動 dev server（launch.json 已定義，port 8081）
cd /Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov
npx serve -l 8081 .
# 瀏覽器開 http://localhost:8081/

# 或 fallback（無 npx 時）
python3 -m http.server 8000
```

1. **煙霧測試三檔**：輸入 `2330`（台積電）、`2412`（中華電）、`2886`（兆豐金）
2. **每區塊檢查**：
   - **股利區塊（修正後）**：標題「近 10 年」與實際年數一致；欄位為年度而非年季；`2330` 年度現金股利近年約 `2023 ≈ 13.0`、`2024 ≈ 17`、`2025 ≈ 22`（非舊的 10–14 範圍；2023 實測 12.999579，四捨五入為 13.0）；**殖利率欄只在最近 5 年有值**（年份早於 `fiveYearsAgo()` 顯示「—」，為 graceful degradation，非 bug）；**發放率欄**：已結年度（如 2015–2024）用 `annualIs`，當年未結年度（如 2025，`is_annual` 尚未公布）顯示「—」+ tooltip「年度財報尚未公布」（方案 B，不做 YTD 推估）
   - **現金流**：8 季完整、`自由現金流量` 欄位有值（以 API 官方值，不是 OCF+ICF）、現金股利覆蓋倍數 >1 為健康
   - **財務比率**：6 張卡全部有值、ROE 介於合理區間（0–50%）、速動比**不應出現**
   - **風險面**：Beta 接近 1 附近、波動度非負、月 K 指標 0–100
   - **治理**：12 個月份完整、設質比 0–100%、>30% 有警示色
   - **長期趨勢**：CAGR 非 NaN、現金股利 CAGR 用聚合年度值算、ROE/ROA 折線可繪
3. **錯誤處理**：輸入不存在股票如 `9999`，各區塊顯示友善錯誤訊息而非空白
4. **DevTools**：
   - Console：無紅色錯誤（F12 → Console）
   - Network：新 5 支 API 全部 200（F12 → Network，filter `dottdot.com`）
5. **Regression**：既有 8 個未動 module 仍正常顯示、K 線仍可展開
6. **響應式**：瀏覽器開發者工具切 mobile(375) / tablet(768) / desktop(1440)，新區塊不溢出

### Claude 可額外使用的 MCP 工具（非必要）

> `preview_start` / `preview_console_logs` / `preview_network` / `preview_resize` 屬 Claude Preview MCP，**僅 Claude 可呼叫**。既有的 [.claude/launch.json](../../.claude/launch.json) 已註冊 `dev` 配置（`npx serve -l 8081 .`），Claude 可直接 `preview_start("dev")` 啟動；一般開發者請用上方 shell 流程。

### 衍生指標單元測試（建議）

repo 的 [package.json](../../package.json) 已設定 `"test": "node --test"`，直接用 **Node 內建測試 runner**，不需新增 vitest/mocha 依賴：

```bash
npm test
```

在 `tests/` 下建立：
- `tests/utils.test.js` — `safeDiv`、`cagr` 邊界
- `tests/dividend_aggregator.test.js` — 季→年聚合
- `tests/financial_ratios.test.js` — ROE / FCF 覆蓋率計算

範例（用 node:test + node:assert）：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeDiv, cagr } from "../js/utils.js";
import { aggregateDividendsToAnnual } from "../js/lib/dividend_aggregator.js";

test("safeDiv handles zero denominator", () => {
  assert.equal(safeDiv(1, 0), null);
});

test("cagr flat series returns 0", () => {
  assert.equal(cagr(100, 100, 5), 0);
});

test("cagr doubling over 1 year returns ~1.0", () => {
  assert.ok(Math.abs(cagr(200, 100, 1) - 1) < 1e-9);
});

test("aggregator handles null input", () => {
  assert.deepEqual(aggregateDividendsToAnnual(null), []);
});

test("aggregator sums cash dividend by year", () => {
  const out = aggregateDividendsToAnnual([
    { 年季: "202401", 現金股利合計: 1, 股票股利合計: 0 },
    { 年季: "202402", 現金股利合計: 2, 股票股利合計: 0 },
  ]);
  assert.equal(out[0].年度, "2024");
  assert.equal(out[0].年度現金股利, 3);
});

test("aggregator does not emit quarterly yield/payout fields", () => {
  const out = aggregateDividendsToAnnual([
    { 年季: "202401", 現金股利合計: 1, 現金股利殖利率: 0.4, 股利發放率: 60 },
  ]);
  assert.ok(!("現金殖利率" in out[0]));
  assert.ok(!("發放率" in out[0]));
});
```

---

## 預期工作量分解（相對）

| Step | 檔案數 | 相對工作量 |
| --- | ---: | --- |
| API fetchers（含 dividend page_size 調整）| 1 | 小 |
| main.js 調度（含 aggregator 調用）| 1 | 小 |
| HTML section | 1 | 小 |
| utils 工具 | 1 | 小 |
| **dividend_aggregator.js（新）** | 1 | 小中（含邊界條件）|
| **dividend.js 修正** | 1 | 小（改吃年度資料）|
| cashflow module | 1 | 中 |
| financial_ratios module | 1 | 中大（衍生多） |
| risk_technical module | 1 | 中 |
| insider_governance module | 1 | 中（需驗欄位名）|
| long_term_trend module | 1 | 中（含折線圖）|
| 驗收 + 欄位微調 | — | 中 |

實作順序建議：
1. Step 1（API）+ Step 6（欄位驗證）
2. 新增 `dividend_aggregator.js` + 修正 `dividend.js` + 修正 index.html 標題（**先把既有 bug 解掉，確保基準正確**）
3. Step 2 骨架（main.js tasks + resetSections）+ Step 3 HTML 新 section
4. Step 5 utils
5. Step 4.1 / 4.3 / 4.4（較直接）
6. Step 4.2 / 4.5（含衍生、吃聚合後年度股利）
7. 驗收
