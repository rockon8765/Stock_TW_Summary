# 股票摘要敘述化 + K 線 OHLC tooltip 改版計畫（2026-05-05）

> **分支**：`feature/layout-claude`
> **Worktree**：`/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov`
> **範圍**：
> 1. **A 案**：`Section 1.6 股票摘要` 從 4 卡儀表板改為「敘述句 + 重點 chips」，消除與 `Section 1 個股資訊` 的重複
> 2. **B 案**：`Section 1.7 K 線圖` 滑鼠移上 K 棒時浮出 OHLC tooltip
>
> **生成方式**：A 案採模板規則（client-side），**不引入 LLM**；B 案使用 Lightweight Charts 既有 `subscribeCrosshairMove` API。

---

## 一、需求背景

### 1.1 現況問題

長官回饋：股票摘要區塊與第一個區塊（個股資訊）視覺與資訊都太類似，重複度高。

**比對結果（資訊重複表）**

| 指標 | Section 1 個股資訊 | Section 1.6 股票摘要 | 是否重複 |
|------|---|---|---|
| 股票名稱 | ✓（標題） | ✓（規則評分卡副文） | 🔁 重複 |
| 收盤價 / 漲幅 | ✓（右上 metric） | ✓（走勢風險卡） | 🔁 重複 |
| PE | ✓（metric card） | ✓（估值風險卡） | 🔁 重複 |
| PB | ✓（metric card） | ✓（估值風險卡） | 🔁 重複 |
| 規則評分 | ✗ | ✓ | ⭐ 摘要獨有 |
| 殖利率 | ✗ | ✓ | ⭐ 摘要獨有 |
| TTM 營收 YoY | ✗ | ✓ | ⭐ 摘要獨有 |
| EPS TTM YoY | ✗ | ✓ | ⭐ 摘要獨有 |
| 1M / 3M 報酬 | ✗ | ✓ | ⭐ 摘要獨有 |

**結論**：摘要中真正獨有的資訊是「規則評分、殖利率、成長 YoY、報酬率」；其餘 PE/PB/收盤都是把第一區塊的數字再列一次。

### 1.2 設計目標

| 目標 | 達成方式 |
|------|---------|
| 與第一區塊資訊明確區隔 | 第一區塊：what（靜態事實）；本區塊：so what（判讀） |
| 降低視覺重複 | 改為敘述句而非卡片陣列 |
| 保留快速掃讀能力 | 敘述下方放 4 個 highlight chips |
| 不引入 AI 成本 / 不確定性 | 模板規則 + 閾值映射 |

---

## 二、設計方案

### 2.1 視覺結構

```
┌────────────────────────────────────────────────────────┐
│ 股票摘要                                                │
│                                                         │
│  [評分大字: B+ 65]   ⚠ 1 條警示｜可評估 12 條           │
│                                                         │
│  台積電（2330）目前估值偏高（PE 28.2），但成長動能強勁——│
│  近 12 個月 TTM 營收年增 +14.3%，EPS 年增 +22.5%；近   │
│  3 個月股價上漲 +8.2%，動能延續中。現金殖利率 2.1%，  │
│  屬中性水準。                                           │
│                                                         │
│  ─────────────────────────────────────────              │
│  [殖利率 2.1%]  [1M +3.4%]  [3M +8.2%]  [TTM YoY +14.3%]│
└────────────────────────────────────────────────────────┘
```

### 2.2 敘述模板結構

敘述句固定四段組合：

```
{name}（{ticker}）目前{估值描述}，{對比連接詞}{成長描述}——
近 12 個月 TTM 營收年增 {salesYoy}，EPS 年增 {epsYoy}；
近 3 個月股價{動能描述} {threeM}，{動能延伸描述}。
{配息描述}。
```

### 2.3 閾值映射規則

#### 估值（依 PE）

| PE 區間 | key | 描述 |
|---------|-----|------|
| 缺值 | `unknown` | 「估值資料不足」 |
| 負值 | `loss` | 「PE 為負，代表近期獲利為負，暫不適合以 PE 判斷估值」 |
| < 10 | `low` | 「估值偏低（PE {pe}）」 |
| 10–20 | `fair` | 「估值合理（PE {pe}）」 |
| 20–30 | `high` | 「估值偏高（PE {pe}）」 |
| > 30 | `very_high` | 「估值明顯偏高（PE {pe}），需注意獲利成長能否支撐」 |

#### 成長（依 salesYoy / epsYoy）

| salesYoy | epsYoy | key | 描述 |
|---|---|---|---|
| ≥ 10 | ≥ 10 | `strong` | 「成長動能強勁」 |
| ≥ 0 | ≥ 0 | `mild` | 「成長溫和」 |
| ≥ 0 | < 0 | `sales_only` | 「營收成長但獲利承壓」 |
| < 0 | ≥ 0 | `eps_only` | 「營收衰退但獲利改善」 |
| < 0 | < 0 | `weak` | 「營收與獲利同步承壓」 |
| 任一缺值 | — | `unknown` | 「成長資料不足」 |

#### 對比連接詞（估值 key × 成長 key）

| 估值 key | 成長 key | 連接詞 |
|---|---|---|
| `high` / `very_high` | `strong` | 「但」 |
| `high` / `very_high` | `mild` / `sales_only` / `eps_only` / `weak` | 「且」 |
| `fair` | `strong` | 「，且」 |
| `fair` | `mild` / `sales_only` / `eps_only` / `weak` | 「，但」 |
| `low` | `strong` / `mild` / `sales_only` / `eps_only` | 「，且」 |
| `low` | `weak` | 「，但」 |
| `loss` | 任一 | 句子改用獨立模板（先講估值不適用，再講成長） |
| `unknown` | 任一 | 「，」（安全 fallback，雙方各自獨立陳述） |
| 任一 | `unknown` | 「，」（同上） |

#### 動能（依 3M 報酬）

| 3M 報酬 | 動能描述 | 動能延伸描述 |
|---------|---------|------|
| ≥ 10% | 「上漲」 | 「動能強勁」 |
| 5%–10% | 「上漲」 | 「動能延續中」 |
| 0%–5% | 「微幅上漲」 | 「走勢偏穩」 |
| -5%–0% | 「微幅下跌」 | 「走勢偏弱」 |
| < -5% | 「下跌」 | 「走勢承壓」 |
| 缺值 | （省略此句） | — |

#### 配息（依現金殖利率）

| 殖利率 | 描述 |
|--------|------|
| 缺值或 0 | 「目前無現金配息資料」 |
| < 1% | 「現金殖利率 {y}%，偏低」 |
| 1%–3% | 「現金殖利率 {y}%，屬中性水準」 |
| 3%–5% | 「現金殖利率 {y}%，具配息吸引力」 |
| > 5% | 「現金殖利率 {y}%，偏高（須留意配息穩定性）」 |

### 2.4 Highlight Chips（保留 4 項）

僅保留第一區塊**沒有**的衍生指標，避免重複：

| Chip | 來源 | 顯色規則 |
|------|------|---------|
| 殖利率 {y}% | dividend / quote | 中性灰 |
| 1M {±x}% | quotes | `valClassChange` |
| 3M {±x}% | quotes | `valClassChange` |
| TTM YoY {±x}% | sales | `valClassChange` |

> 移除目前的 PE/PB/收盤卡（已在第一區塊呈現）。

### 2.5 規則評分區塊處理

評分大字保留（這是摘要區塊獨有錨點），但與標題列同行右側佈局；下方的「警示 / 可評估 / 資料不足」改為一行內 inline 顯示，不再用大卡片。

---

## 三、不採用 LLM 的決策依據

| 評估面向 | 模板規則 | LLM 生成 | 採用 |
|---------|---------|---------|------|
| 邊際成本 | $0 | ~$0.001–0.01 / 檔 | 模板 ✓ |
| 延遲 | <1ms | 1–3 秒 | 模板 ✓ |
| 確定性 | 同數據 → 同結果 | 可能漂移、有幻覺風險 | 模板 ✓ |
| 金融合規 | 規則可審查 | 誤判（負值寫成「強勁」）難測 | 模板 ✓ |
| 表達豐富度 | 受限於模板 | 較自然 | LLM 略勝 |
| 離線/快取友好 | 完全靜態 | 需打 API | 模板 ✓ |

**結論**：摘要區塊的判讀規則具有金融共識（PE 高低、YoY 正負），不存在 LLM 才能處理的不確定性，採用模板規則。

> 後續若要做「深度分析」（讀法說會 / 新聞 / 產業趨勢綜合判讀），再另案評估 LLM 整合。

---

## 四、受影響檔案

```
js/modules/stock_summary.js          （主要改寫，預計 < 200 行）
js/main.js                            （resetSections() L209 4 個 skeleton → 1 個 narrative placeholder）
css/style.css                         （新增 .stock-summary-* 樣式：narrative / chips / chip）
index.html                            （Section 1.6 容器 grid → flex 直向）
tests/stock_summary.test.js           （改寫斷言：DOM 結構 + 文字片段檢查）
```

**不需動的**：`profile.js`、`api.js`、`utils.js`（沿用 `formatNumber`、`signStr`、`valClassChange`、`safeDiv` 即可）。

---

## 五、實作步驟（TDD）

### 5.1 純函式抽出（先寫測試）

在 `js/modules/stock_summary.js` 內新增**純函式**並各自寫測試。**所有 classify 函式同時回傳 `key`（內部 enum）與 `text`（顯示文字）**，避免 key/string 混用：

| 函式 | 輸入 | 輸出 |
|------|------|------|
| `classifyValuation(pe)` | `number \| null` | `{ key: 'unknown'\|'loss'\|'low'\|'fair'\|'high'\|'very_high', text: string }` |
| `classifyGrowth(salesYoy, epsYoy)` | `number \| null, number \| null` | `{ key: 'strong'\|'mild'\|'sales_only'\|'eps_only'\|'weak'\|'unknown', text: string }` |
| `classifyMomentum(threeM)` | `number \| null` | `{ key, verb, extension } \| null` |
| `classifyDividend(dy)` | `number \| null` | `{ key, text }` |
| `joinValuationGrowth(valKey, growthKey)` | `string, string` | `string` 連接詞 |
| `buildNarrative({ name, ticker, valuation, growth, momentum, dividend, salesYoy, epsYoy, threeM })` | object | full string |

> 採 JSDoc 標註型別（沿襲 typescript/coding-style 的 JSDoc 規範，因專案為 `.js`）。
> `classify*` 命名反映「這是分類」而非「只是描述」，與 key 同時提供的設計呼應。

### 5.2 渲染整合

`renderStockSummary` 改為：
1. 計算所有指標（沿用既有 `computeTtmSalesYoy` / `computeEpsTtmYoy` / `quoteReturn`）
2. 呼叫上述純函式組句
3. 輸出 DOM：`<div class="stock-summary-header">` + `<p class="stock-summary-narrative">` + `<div class="stock-summary-chips">`

### 5.3 樣式新增

> 顏色變數依 `css/style.css:7-11` 既有定義，**不使用不存在的 `--color-text`**：
> - 標題、評分大字 → `--color-text-strong`
> - narrative 內文 → `--color-text-body`
> - chip label / 副字 → `--color-text-subtle`

```css
.stock-summary-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
  color: var(--color-text-strong);
}
.stock-summary-narrative {
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--color-text-body);
}
.stock-summary-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-surface-700);
}
.stock-summary-chip {
  font-size: 0.8rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  background: var(--color-surface-900);
  color: var(--color-text-subtle);
}
```

### 5.4 HTML 容器調整

`index.html:79`

```diff
-<div id="stock-summary-content" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
+<div id="stock-summary-content">
   <div class="section-loading">...</div>
 </div>
```

skeleton 從 4 塊 24 高度 → 改為 1 塊 16 高度的單一 placeholder。

### 5.5 main.js resetSections() 同步調整

`js/main.js:209-213` 把：

```diff
-"stock-summary-content": Array.from({ length: 4 }, () =>
-  buildLoadingMarkup("股票摘要", {
-    skeletonClass: "h-24 w-full rounded-lg",
-  }),
-).join(""),
+"stock-summary-content": buildLoadingMarkup("股票摘要", {
+  skeletonClass: "h-16 w-full rounded-lg",
+}),
```

否則 ticker 切換時 `resetSections()` 會重新塞回 4 個 skeleton，導致首次 render 前的視覺與新版 narrative layout 不一致。

---

## 六、測試計畫

### 6.1 單元測試（新增）

針對 5.1 抽出的 6 個純函式各寫一組 table-driven 測試：

| 測試案例分類 | 範例輸入 | 預期斷言重點 |
|---|---|---|
| 估值各區段 key | PE = null / -3 / 5 / 15 / 25 / 50 | 對應 6 個 key（`unknown` / `loss` / `low` / `fair` / `high` / `very_high`） |
| 估值負值專屬 | PE = -3 | text 含「PE 為負」「不適合以 PE 判斷」字串；不可包含「估值偏高」 |
| 成長 6 種組合 key | (sales, eps) ∈ {±10%, ±5%, null} | 對應 6 個 key |
| 動能各區段 | 3M = null / -10 / -3 / 3 / 7 / 15 | 對應動詞 + 延伸描述 |
| 配息各區段 | dy = null / 0.5 / 2 / 4 / 7 | 對應 5 種文字 |
| 連接詞矩陣 | 估值 key × 成長 key 全組合 | 對應正確連接詞；未列組合 fallback 為「，」 |
| 整句組裝 | 完整 mock | 不含 `{` / 不含 `null` / 不含 `NaN` / 不含 `undefined` |
| 整句組裝 — 負 PE 路徑 | PE = -3 + sales+eps 任意 | 句子使用 `loss` 獨立模板，不嘗試與成長句串接 |

### 6.2 既有測試遷移

`tests/stock_summary.test.js` 目前以「4 張 info-card 都存在」為斷言。需改為：
- 斷言 `<p class="stock-summary-narrative">` 存在且長度 > 50 字
- 斷言 `<div class="stock-summary-chips">` 含 4 個 chip
- 斷言 chip 文字含預期 token（如「殖利率」、「1M」、「3M」、「TTM」）
- 斷言評分大字 `<span class="score-card-large">` 仍存在（不變）

### 6.3 缺值容忍測試

逐一傳入：
- `quotes = []`
- `sales = []`
- `income = []`
- `dividend = []`
- `ruleScore = null`

預期：仍能渲染，敘述句以「資料不足」字眼降級，**不丟錯**。

#### 6.3.1 `null` 強制檢查（避免 `0.00%` 誤判）

> **背景**：`js/utils.js:17-23` 的 `toFiniteNumber()` 用 `Number(value)` 判斷有效性。
> `Number(null) === 0`（非 NaN），所以 `formatPercent(null)` 會輸出 `'0.00%'` **不是** `'—'`。
> 這代表：把 null 直接丟給 formatter，缺值會被誤寫成 0%，是 1 級誤導。

**規範**（純函式 + render 都要遵守）：
1. 在呼叫 `formatPercent` / `formatNumber` 前**先檢查 `value == null`**，若 null 直接顯示 `'—'`
2. classify 系列函式遇 null 必須走 `unknown` 分支，**不可以**讓 null 流入閾值比較（`null < 0` 是 false 但 `null >= 0` 也 true，會誤判）
3. chips 顯示同一原則：null → 「殖利率 —」、「1M —」等，**禁止** 0% 替代

**對應測試**：
- `classifyValuation(null)` → `key === 'unknown'`，**且 text 不含 `'0'` 字元**
- `classifyDividend(null)` → text 含「無配息資料」，**不含 `0.00%`**
- chip 渲染遇 null → DOM 文字含 `'—'`，不含 `'0.00%'`

### 6.4 視覺檢核（手動）

固定三檔代號（與 B 案 10B.3 共用）：

| 代號 | 預期行為 |
|------|---------|
| `2330` | 正常股票 — 完整敘述、4 個 chips |
| `0050` | ETF — 部分指標可能缺（如 EPS YoY），敘述應降級顯示「成長資料不足」而非報錯 |
| `9999` | 無效代號 — 不應到達 render；若進到，顯示空白或既有錯誤態 |

其他檢核：
- 320 / 768 / 1440 三個寬度下換行正常
- 敘述句顏色（`--color-text-body`）與卡片背景對比足夠
- chip 在正/負值有正確紅綠

---

---

## A / B 分隔線：以下為 B 案 — K 線圖 OHLC tooltip

---

## 六-B、需求背景（B 案）

### 6B.1 現況

`js/charts/kline.js` 使用 **Lightweight Charts**（TradingView 開源），目前：
- 已啟用 `crosshair: { mode: CrosshairMode.Normal }`（十字準星可見）
- 預設只顯示時間軸標籤與右側價格軸數值
- **沒有任何 OHLC 浮動 tooltip**
- 圖上有 3 個 series：`candleSeries`（OHLC）、`volumeSeries`（量）、`scoreOverlaySeries`（規則評分）

### 6B.2 長官需求

滑鼠移上 K 棒時，顯示該 K 棒的：
- O（開盤）
- H（最高）
- L（最低）
- C（收盤）

**延伸建議（同個 tooltip 內順便顯示）**：
- 日期
- 漲跌（C - 前 C）與漲跌幅
- 成交量
- 規則評分（若該日有資料）

理由：tooltip 已開（hover 成本已付出），多 4 個欄位幾乎不增加實作或視覺負擔，但可避免使用者反覆 hover 多個位置。

---

## 七-B、設計方案（B 案）

### 7B.1 視覺結構

採「跟隨游標的浮動 div」（Lightweight Charts 官方推薦模式）：

```
┌─────────────────────────┐
│ 2026-05-04              │
├─────────────────────────┤
│ 開  582.00              │
│ 高  588.00              │
│ 低  580.00              │
│ 收  585.00  ▲ +3.00 (+0.51%)│
│ 量  18,432.00 張 (18,432,000 股)│
│ 規則評分  72            │
└─────────────────────────┘
```

- 背景：半透明深色（與圖表深色背景對比）
- 漲跌色：沿用既有 `valClassChange` 的紅綠規則（紅漲綠跌，台股慣例）
- 位置：游標右上 8px，碰到右邊界自動翻到游標左側

#### 成交量單位（重要）

K 線 `volumeSeries.value` 由 `resolveShareVolume()`（[js/charts/kline.js:151](../../js/charts/kline.js)）回傳，**單位為「股」**（dottdot `成交量_股` 或 `成交量 * 1000`）。

Tooltip 顯示策略：
- **主數字以「張」為單位**（台股使用者直覺）：`shares / 1000`，**保留 2 位小數**（避免高估／低估），格式 `formatLocaleNumber(shares / 1000, 2)` + 「張」
- **括號內附股數原始值**（避免誤讀，且驗證一致性）：`shares.toLocaleString()` + 「股」
- 純函式 `formatVolumeForTooltip(shares: number) => { lots: string, shares: string }` 抽出測試

#### 邊界處理

| 輸入 shares | lots 輸出 | shares 輸出 |
|------------|----------|------------|
| `null` / `undefined` / `NaN` | `'—'` | `'—'` |
| `0` | `'—'` | `'—'`（無交易視同缺值，避免「0 張」誤導為交易停止 vs 假日無資料） |
| `999` | `'<1 張 (999 股)'` 形式合併顯示，**不**單獨四捨五入到 1 張 | — |
| `1500` | `'1.50'` | `'1,500'` |
| `18,432,000` | `'18,432.00'` | `'18,432,000'` |

> **絕對禁止** 直接寫「{volData.value} 張」，會差 1000 倍。
> **絕對禁止** 把不滿 1 張的零碎股四捨五入到「1 張」，零股交易（< 1000 股）必須顯示原始股數。

### 7B.2 行為規範

| 情境 | 行為 |
|------|------|
| 滑鼠在圖內、有 K 棒 | 顯示 tooltip，內容為當下 K 棒資料 |
| 滑鼠移出圖外 | 隱藏 tooltip |
| 滑鼠在圖內但無資料點（早於最早日期） | 隱藏 tooltip |
| 觸控裝置 | 點擊 K 棒顯示，再次點擊空白處隱藏 |
| 鍵盤左右鍵 | 不在本次範圍 |

### 7B.3 實作要點

Lightweight Charts 標準 pattern：

```js
// 偽碼示意
const tooltip = document.createElement("div");
tooltip.className = "kline-tooltip";
container.appendChild(tooltip);

chart.subscribeCrosshairMove((param) => {
  if (
    !param.point ||
    !param.time ||
    param.point.x < 0 || param.point.x > container.clientWidth ||
    param.point.y < 0 || param.point.y > container.clientHeight
  ) {
    tooltip.style.display = "none";
    return;
  }
  const candleData = param.seriesData.get(candleSeries);
  const volData = param.seriesData.get(volumeSeries);
  const scoreData = scoreOverlaySeries
    ? param.seriesData.get(scoreOverlaySeries)
    : null;
  if (!candleData) {
    tooltip.style.display = "none";
    return;
  }
  const dateKey = timeToDateKey(param.time);
  tooltip.innerHTML = renderTooltipHtml({
    date: dateKey,
    open: candleData.open,
    high: candleData.high,
    low: candleData.low,
    close: candleData.close,
    volumeShares: volData?.value,    // 單位：股
    score: scoreData?.value,
    prevClose: findPrevClose(allData, dateKey),
  });
  positionTooltip(tooltip, param.point, container);
  tooltip.style.display = "block";
});
```

### 7B.4 `param.time` 正規化

Lightweight Charts 的 `time` 可能是：
- ISO date string（`'2026-05-04'`）
- `BusinessDay` object（`{ year, month, day }`）
- UNIX timestamp（number）

抽純函式 `timeToDateKey(time): 'YYYY-MM-DD'` 統一輸出，並在輸入端把 `findPrevClose` 改成接受 `dateKey` 字串，避免比對失敗。

### 7B.5 前一日收盤價來源

`allData`（已排序）依日期 binary search 找到當日 index，取 `allData[index-1]["收盤價"]`。

提供純函式 `findPrevClose(allData, dateKey): number | null`：
- 找不到當日：回 `null`
- 是第一筆：回 `null`（顯示「—」）

### 7B.6 樣式新增

```css
.kline-tooltip {
  position: absolute;
  pointer-events: none;
  z-index: 10;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid var(--color-surface-700);
  border-radius: 0.5rem;
  padding: 0.6rem 0.8rem;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--color-text-body);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  display: none;
}
.kline-tooltip-date {
  font-weight: 600;
  color: var(--color-text-strong);
  border-bottom: 1px solid var(--color-surface-700);
  padding-bottom: 0.25rem;
  margin-bottom: 0.35rem;
}
.kline-tooltip-row { display: flex; justify-content: space-between; gap: 1.5rem; }
.kline-tooltip-label { color: var(--color-text-subtle); }
```

> 採 `position: absolute` 配合 `kline-chart` 容器設為 `position: relative`。
> 顏色變數沿用 `css/style.css:7-11` 既有變數，不使用不存在的 `--color-text`。

### 7B.7 容器定位修正

確認 `index.html` 中 `#kline-chart` 父層為 `position: relative`，否則 tooltip 會被 fixed 到視窗。檢查時若不是，補上樣式。

---

## 八-B、受影響檔案（B 案）

```
js/charts/kline.js                    （新增 tooltip 渲染 + crosshair/click 訂閱，預計 +120 行）
css/style.css                          （新增 .kline-tooltip-* 樣式 + #kline-chart 定位）
tests/kline.test.js                    （新增 timeToDateKey / findPrevClose / formatVolumeForTooltip / buildTooltipPayload / renderTooltipHtml / positionTooltipStyle 測試）
```

**不需動的**：`index.html`（容器已存在），除非 7B.7 檢查發現 `position` 問題。

**B 案前置條件**：
- 工作目錄目前有未提交的 `js/charts/kline.js` + `tests/kline.test.js`（K 線 volume contract 修正：改用股數）
- **必須先把這個 bugfix 獨立 commit**（建議訊息：`fix(kline): use share-volume from 成交量_股 with 成交量*1000 fallback`）
- 再開始 B 案，避免 tooltip 改動與成交量 bugfix 混在一起影響 review

---

## 九-B、實作步驟（B 案）

### 9B.1 抽純函式（先寫測試）

| 函式 | 簽章 | 用途 |
|------|------|------|
| `timeToDateKey(time)` | `(string\|number\|{year,month,day}) => 'YYYY-MM-DD'` | 正規化 Lightweight Charts 的 `param.time` |
| `findPrevClose(allData, dateKey)` | `(Array, string) => number\|null` | 取前一交易日收盤；找不到、第一筆 → null |
| `formatVolumeForTooltip(shares)` | `(number) => { lots: string, shares: string }` | 股數轉「張」+「股」雙顯示 |
| `buildTooltipPayload({date, ohlc, prevClose, volumeShares, score})` | `(obj) => obj` | 純資料整合（含漲跌、漲跌幅、配色 key） |
| `renderTooltipHtml(payload)` | `(obj) => string` | 純函式產 HTML，**所有外部值都經 `escapeHtml`** |
| `positionTooltipStyle(point, containerWidth, containerHeight, tooltipWidth, tooltipHeight)` | `(obj, num, num, num, num) => {left, top}` | 算左右 + 上下翻轉位置（要做下緣翻轉必須有 containerHeight） |

### 9B.2 整合 `subscribeCrosshairMove` + listener 管理

**修正 v1 計劃的錯誤論述**：本地 vendor 提供 `unsubscribeCrosshairMove`（與 `unsubscribeClick`），所以**保留 handler reference**並在重建時 `unsubscribe`：

```js
let crosshairHandler = null;
let clickHandler = null;

// renderKline() 開頭清理區塊新增：
if (chart && crosshairHandler) {
  chart.unsubscribeCrosshairMove(crosshairHandler);
  crosshairHandler = null;
}
if (chart && clickHandler) {
  chart.unsubscribeClick(clickHandler);
  clickHandler = null;
}
// ...既有 chart.remove()...

// renderKline() 末段註冊：
const tooltipEl = createTooltipEl(container);
crosshairHandler = (param) => handleCrosshair(param, tooltipEl, container);
chart.subscribeCrosshairMove(crosshairHandler);
```

> 雖然 `chart.remove()` 後舊 listener 隨 chart 消失，但**保留 handler reference 顯式 unsubscribe** 是更安全的契約：未來若改成重用 chart instance（例如資料增量更新而不重建），不需重寫 listener 管理邏輯。

### 9B.3 觸控支援（決策：列入 v1）

長官需求未明確要求觸控，但 7B.2 的行為規範已寫「觸控點擊顯示」，為避免驗收項目與設計不一致，**v1 範圍包含觸控**：

```js
clickHandler = (param) => handleCrosshair(param, tooltipEl, container);
chart.subscribeClick(clickHandler);
```

`subscribeClick` 在桌面點擊也會觸發；行為與 hover 一致即可（同個 handler）。

> 若驗收時長官覺得不需觸控，移除這 2 行 + unsubscribe 即可，零額外成本。

### 9B.4 Tooltip DOM 生命週期

- `createTooltipEl`：若 container 內已有 `.kline-tooltip` 先移除再新建（避免 re-render 殘留）
- `renderKline()` 開頭已 `container.innerHTML = ""`，會一併清除舊 tooltip，但 listener 必須在 `chart.remove()` **之前** unsubscribe（chart 已 remove 後 unsubscribe 會丟錯）

### 9B.5 樣式

落實 7B.6；外加 `#kline-chart { position: relative; }`（若尚未設定）。

---

## 十-B、測試計畫（B 案）

### 10B.1 單元測試（新增）

| 函式 | 案例 |
|------|------|
| `timeToDateKey` | string `'2026-05-04'` → `'2026-05-04'`；BusinessDay `{year:2026,month:5,day:4}` → `'2026-05-04'`；UNIX timestamp → 對應日期；單位數月日補 0 |
| `findPrevClose` | 第一筆 → null；中間筆 → 上一筆收盤；找不到 dateKey → null；空陣列 → null |
| `formatVolumeForTooltip` | `null` / `NaN` / `0` → `{lots:'—', shares:'—'}`；999 股 → `{lots:'<1', shares:'999'}`（不四捨五入到 1）；1500 股 → `{lots:'1.50', shares:'1,500'}`；18,432,000 股 → `{lots:'18,432.00', shares:'18,432,000'}` |
| `buildTooltipPayload` | OHLC 全有；prevClose 為 null → change/changePct 為 null；volumeShares 缺 → 顯示「—」 |
| `renderTooltipHtml` | 含日期、O/H/L/C 四列；含漲跌列；含成交量列；缺 score 時不渲染該列 |
| `renderTooltipHtml` **escape 測試** | 餵 `payload.date = '<img onerror=x>'` → 輸出含 `&lt;img` 不含 `<img`；驗證所有外部值都經 `escapeHtml`（防 XSS） |
| `positionTooltipStyle` | 游標靠右邊界 → tooltip 翻到左側；靠左 → 預設右側；靠下緣（`point.y + tooltipHeight > containerHeight`）→ 翻到上側；靠上緣 → 預設下側；四角極端組合（同時觸發左右 + 上下翻轉）皆正確 |

### 10B.2 整合（DOM smoke）

在 `tests/kline.test.js`：
- mock `LightweightCharts`，包含 `subscribeCrosshairMove` / `unsubscribeCrosshairMove` / `subscribeClick` / `unsubscribeClick`
- 確認 `subscribeCrosshairMove` 與 `subscribeClick` 各被呼叫一次
- **listener 清理測試**：呼叫第二次 `renderKline()`，斷言對舊 chart 的 `unsubscribeCrosshairMove` 與 `unsubscribeClick` 都被呼叫
- 模擬呼叫 handler 餵入 mock param（時間給 BusinessDay 與 string 兩種型別），斷言：
  - tooltip element 存在於 container 內
  - tooltip 含 OHLC 四個值的字串
  - tooltip 含「張」「股」雙單位
  - 模擬空 param → tooltip `display: none`

### 10B.3 手動視覺檢核

固定三檔代號（覆蓋正常 / ETF / 邊界）：

| 代號 | 預期行為 |
|------|---------|
| `2330` | 正常股票 — 完整 OHLC、量、評分 |
| `0050` | ETF — 部分欄位（如評分）可能缺；tooltip 應降級不丟錯 |
| `9999` | 無效代號 — 不應到達 K 線渲染；若進到，tooltip 不顯示且 console 無錯 |

其他檢核：
- 在 5Y 範圍快速 hover 數百根 K 棒，無視覺殘影、無 console 錯誤
- 切換 3M / 6M / 1Y / 3Y / 5Y 後 hover 仍正常
- 切換 ticker 5 次後 hover 仍正常（記憶體/listener 不洩漏；可在 DevTools Memory 拍 heap snapshot 對比）
- 觸控裝置（DevTools mobile mode）點擊 K 棒能顯示
- 暗色模式下對比足夠

---

## 十一、風險與緩解

### A 案（股票摘要）

| 風險 | 機率 | 影響 | 緩解 |
|------|------|------|------|
| 模板敘述讀起來像「機器寫的」 | 中 | 低 | 連接詞表設計有變化；後續可加微調 |
| 閾值對某產業不適用（例如金融股 PE 天生偏低） | 中 | 中 | 第一版以全市場為基準，後續可加 `industry` 維度的閾值 override |
| 既有測試大量重寫 | 高 | 低 | 在 5.1 完成純函式測試後再改 render 測試，分兩個 commit |
| 缺值組合造成奇怪句子 | 中 | 中 | 6.3 的缺值測試覆蓋 |
| CSS 變更影響其他區塊 | 低 | 低 | 新類名一律加 `stock-summary-` 前綴 |

### B 案（K 線 tooltip）

| 風險 | 機率 | 影響 | 緩解 |
|------|------|------|------|
| 切換 ticker 後 listener 殘留 | 中 | 中 | 9B.2 的驗證點：切換 5 次後檢查 |
| Tooltip 跟 crosshair 標籤重疊難讀 | 中 | 低 | 翻轉定位 + 與游標保持 8px 偏移 |
| 觸控裝置 hover 行為與桌面不同 | 低 | 低 | 文件中明列「點擊顯示、再點空白隱藏」即可 |
| Lightweight Charts 版本 API 不一致（新 / 舊 series API） | 中 | 中 | 既有 code 已用 `if (LightweightCharts.CandlestickSeries)` fallback，tooltip 使用的 `subscribeCrosshairMove` 跨版本穩定 |
| 大量資料時 hover 效能 | 低 | 低 | handler 內無重計算，只查 `param.seriesData.get`，O(1) |

---

## 十二、驗收條件

### A 案

- [ ] 所有純函式單元測試通過（`node --test`）
- [ ] DOM smoke 測試通過
- [ ] 手動瀏覽至少 3 檔股票（成長/平穩/衰退各一）敘述合理
- [ ] 缺值情境（新上市、無營收歷史）不丟錯
- [ ] 與 Section 1 並列檢視，無重複資訊
- [ ] 320 / 768 / 1440 寬度版面正常

### B 案

- [ ] `subscribeCrosshairMove` 與 `subscribeClick` 訂閱成功
- [ ] OHLC 四項數值正確顯示
- [ ] 成交量顯示「{lots} 張 ({shares} 股)」雙單位，無 1000 倍誤差
- [ ] 漲跌色與台股慣例一致（紅漲綠跌）
- [ ] 滑出圖外 tooltip 隱藏
- [ ] 切換 ticker 5 次後仍正常 hover、無 console 錯誤
- [ ] 切換 ticker 時舊 chart 的 `unsubscribeCrosshairMove` 與 `unsubscribeClick` 被呼叫（單元測試覆蓋）
- [ ] `renderTooltipHtml` escape 測試通過（XSS 防護）
- [ ] `param.time` 三種型別（string / BusinessDay / number）皆可正確正規化
- [ ] 觸控裝置點擊可顯示
- [ ] tooltip 不擋到右邊界 K 棒（碰邊翻轉）
- [ ] 三檔代號（2330 / 0050 / 9999）視覺檢核通過

### 前置條件

- [ ] 既有的成交量股數 fix 已獨立 commit，B 案不混入該變更

---

## 十三、預估工時

### A 案

| 步驟 | 預估 |
|------|------|
| 5.1 純函式（classify*）+ 單元測試（含負 PE / unknown 路徑） | 1.8 hr |
| 5.2 renderStockSummary 整合 | 0.5 hr |
| 5.3 CSS | 0.3 hr |
| 5.4 HTML 容器 + 5.5 main.js skeleton | 0.2 hr |
| 6.2 既有測試遷移 | 0.5 hr |
| 6.4 視覺檢核（含 2330/0050/9999） | 0.4 hr |
| **A 案合計** | **~3.7 hr** |

### B 案

| 步驟 | 預估 |
|------|------|
| Step 0 拆出 volume fix commit | 0.2 hr |
| 9B.1 純函式（含 timeToDateKey / formatVolumeForTooltip / escape）+ 測試 | 1.2 hr |
| 9B.2 + 9B.3 + 9B.4 整合 + crosshair/click 訂閱 + listener 清理 | 0.7 hr |
| 9B.5 CSS | 0.3 hr |
| 10B.2 整合測試（含 unsubscribe / 雙時間型別 / escape） | 0.6 hr |
| 10B.3 視覺檢核（含 2330/0050/9999） | 0.5 hr |
| **B 案合計** | **~3.5 hr** |

### 總計

| 項目 | 工時 |
|------|------|
| A 案 + B 案 | **~7.2 hr** |

---

## 十四、實作順序建議

**Step 0（前置條件，必做）**：先把 worktree 既有的 `js/charts/kline.js` + `tests/kline.test.js` 成交量股數 fix 獨立 commit
- 訊息建議：`fix(kline): use share-volume from 成交量_股 with 成交量*1000 fallback`
- 不可與 B 案 tooltip 改動混在一起，否則 review 時難辨識

**Step 1**：B 案（K 線 tooltip）— 改動範圍小、純加值、無 UI 重構

**Step 2**：A 案（摘要敘述化）— 涉及測試重寫，較多改動

三段彼此獨立，**3 個 commit / 可合併為 1 個或拆成 2 個 PR**：
- `fix: kline volume contract use shares` ← Step 0
- `feat: kline OHLC tooltip on hover` ← Step 1
- `refactor: stock summary card → narrative + chips` ← Step 2

---

## 十五、未列入本次範圍

### A 案

- LLM「深度分析」按鈕（另案）
- 產業別客製閾值（另案）
- 多語系（目前僅繁中）
- 同業 PE 比較資料源接入（敘述目前用全市場閾值近似）

### B 案

- 鍵盤左右鍵切換 K 棒
- Tooltip 內顯示技術指標（MA、KD…）
- 框選日期區間統計
- 比較模式（多檔 hover 同步）
