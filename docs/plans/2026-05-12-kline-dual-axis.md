# K 線分數與股價拆成左右雙軸（2026-05-12）

> **分支**：`feature/layout-claude`
> **Worktree**：`/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov`
> **範圍**：把 K 線圖上的「警示分數」黃線從右側 overlay scale 改成可見的左軸；K 棒繼續用右軸；Volume 維持自己的覆蓋 scale。
> **不在範圍**：規則引擎本身、分數計算、tooltip 內容、其他 chart 顏色 / 主題。

---

## 一、問題與動機

目前 [js/charts/kline.js:138](../../js/charts/kline.js) 用自訂 ID 建立 score scale：

```js
const lineOptions = {
  color: "#fbbf24",
  lineWidth: 2,
  priceScaleId: "score",           // 自訂 ID → Lightweight Charts 視為 overlay
  priceFormat: { type: "price", precision: 1, minMove: 0.1 },
};
chart.priceScale("score").applyOptions({
  scaleMargins: { top: 0.1, bottom: 0.7 },  // 黃線收在上方 20%
  mode: 1,
});
```

副作用：
- overlay scale 預設 `visible: false`，**右軸只看得到 K 棒的股價刻度**（e.g. 20~30），黃線 0~10 的值在圖上沒有對應的軸數字
- 使用者抱怨「警示分數跟 K 棒股價都顯示在右邊的 Y 軸，看起來會重疊有點亂」── 實質是「我看到右軸數字、看到上方一條黃線，但黃線值要靠 tooltip 才知道」
- 黃線雖然 `top: 0.1 / bottom: 0.7` 會把繪製區壓在上方 20%，但 K 棒的 default right scale 仍占滿整個高度，視覺上 K 棒最高點與黃線會在同一段 Y 範圍重疊

## 二、設計

把分數改用 Lightweight Charts 的內建 `left` scale，並把左軸設為可見。

| 元素 | priceScaleId | 視覺位置 | scaleMargins |
|---|---|---|---|
| K 棒（CandlestickSeries） | `right`（預設） | 右側可見刻度，繪製區佔中段 30%~70% | `top: 0.3, bottom: 0.3` |
| Volume（HistogramSeries） | `volume`（overlay） | 不顯示刻度，繪製區底部 80%~100% | `top: 0.8, bottom: 0`（不變） |
| 分數（LineSeries） | `left`（內建） | **左側可見刻度，固定 0~10**，繪製區上方 5%~25% | `top: 0.05, bottom: 0.75` |

> **垂直區段示意**（總高度 100%）：
> - 0% ─ 5%：上邊距
> - 5% ─ 25%：分數黃線（左軸）
> - 25% ─ 30%：緩衝帶（分數 / K 棒）
> - 30% ─ 70%：K 棒（右軸）
> - 70% ─ 80%：緩衝帶（K 棒 / Volume）
> - 80% ─ 100%：Volume

要點：
1. **三段分區、兩條緩衝帶**：分數 5%~25%、K 棒 30%~70%、Volume 80%~100%，中間各留 5% 緩衝；黃線不會穿過 K 棒繪製區、K 棒也不會壓到 Volume
2. **左軸樣式跟右軸一致**：`borderColor: "#475569"`、字色繼承 chart `textColor`
3. **左軸固定 0~10**：警示分數本就是 0~10 絕對分數，**autoScale 會把實際出現的 4~6 放大成整個左軸高度**，視覺上誇大警示變化幅度。改用 series-level `autoscaleInfoProvider` 鎖定範圍（v4 price scale 沒有 `setVisibleRange`，那是 time scale API）：
   ```js
   autoscaleInfoProvider: () => ({
     priceRange: { minValue: 0, maxValue: 10 },
   }),
   ```
4. **保留 score series 的 `priceFormat: { precision: 1, minMove: 0.1 }`**：左軸刻度顯示「0.0、2.0、...」這種一位小數
5. **拿掉 overlay 的 score scale**：原本的 `chart.priceScale("score").applyOptions(...)` 整段移除

## 三、實作步驟

### Step 1 ─ chart 建立時開啟左軸

```js
// js/charts/kline.js renderKline()
chart = LightweightCharts.createChart(container, {
  // ...
  rightPriceScale: {
    borderColor: "#475569",
    scaleMargins: { top: 0.3, bottom: 0.3 },    // K 棒在 30%~70%
  },
  leftPriceScale: {
    visible: true,                               // 開啟左軸
    borderColor: "#475569",
    scaleMargins: { top: 0.05, bottom: 0.75 },  // 分數在 5%~25%
  },
  // ...
});
```

### Step 2 ─ score series 改 priceScaleId + 鎖定 0~10

```js
// js/charts/kline.js ensureScoreSeries()
function ensureScoreSeries() {
  if (!chart || scoreOverlaySeries) return;
  const lineOptions = {
    color: "#fbbf24",
    lineWidth: 2,
    priceScaleId: "left",                        // 改為內建 left
    priceFormat: { type: "price", precision: 1, minMove: 0.1 },
    autoscaleInfoProvider: () => ({              // 鎖定 0~10，避免 autoScale 誇大
      priceRange: { minValue: 0, maxValue: 10 },
    }),
  };
  if (LightweightCharts.LineSeries) {
    scoreOverlaySeries = chart.addSeries(LightweightCharts.LineSeries, lineOptions);
  } else if (chart.addLineSeries) {
    scoreOverlaySeries = chart.addLineSeries(lineOptions);
  }
  // 不再 applyOptions 到 "score" scale，改在 chart-level 設 leftPriceScale
}
```

### Step 3 ─ 移除舊的 overlay scale 設定

刪掉 `ensureScoreSeries` 內 `chart.priceScale("score").applyOptions({ scaleMargins: { top: 0.1, bottom: 0.7 }, mode: 1 })` 整塊，因為新版用 chart-level `leftPriceScale` 取代。

### Step 4 ─ tooltip / 其他 binding 確認

[js/charts/kline.js](../../js/charts/kline.js) 的 `handleTooltipMove` / `crosshairHandler` / `clickHandler` 不需要改 ─ 它們以 `param.seriesData` 為單位，不依賴 priceScaleId。為了**鎖住「換軸不影響 tooltip」**這個契約，仍要補一條斷言（見 Step 5 用例 4）。

### Step 5 ─ 測試

[tests/kline.test.js:464](../../tests/kline.test.js) 既有 `assert.equal(scoreSeries.options.priceScaleId, "score")` 必須改為 `"left"`。

mock 現況（[tests/kline.test.js:67-160](../../tests/kline.test.js)）：
- `chartApi.addSeries` 會把 `{ type, options, ... }` push 進 `addedSeries`，所以 series 的 options 是**屬性**，用 `series.options.priceScaleId` 讀，**不是** `series.options()` 方法
- `chartApi.priceScale(id)` 只回傳 `{ applyOptions() {} }`，沒有 `options()` getter
- `global.LightweightCharts.createChart(opts)` 目前**沒記錄** `opts`（直接 `return chartApi`），要先擴充 wrapper

擴充方式：用 mutable state 物件（避免 `return { createChartOptions }` 把當下的 `null` capture 進去後再也不更新）：

```js
// tests/kline.test.js installKlineTestGlobals() 內
const state = {
  createChartOptions: null,
  priceScaleApplyCalls: [],   // [{ id: "left", options: {...} }, ...]
};

// global.LightweightCharts wrapper（記錄 opts 後 return chartApi）
global.LightweightCharts = {
  // ...原本欄位
  createChart(opts) {
    state.createChartOptions = opts;
    return chartApi;
  },
};

// chartApi.priceScale(id) 改成記錄
priceScale(id) {
  return {
    applyOptions(options) {
      state.priceScaleApplyCalls.push({ id, options });
    },
  };
},

// 把 state 物件 return 出去，測試讀 ctx.state.createChartOptions / ctx.state.priceScaleApplyCalls
return { state, addedSeries, ... };
```

| 用例 | 期望 |
|------|------|
| 1. 改既有 assertion | `scoreSeries.options.priceScaleId === "left"` |
| 2. createChart 拿到的左軸 options | `ctx.state.createChartOptions.leftPriceScale.visible === true`、`leftPriceScale.scaleMargins.top === 0.05`、`leftPriceScale.scaleMargins.bottom === 0.75` |
| 3. createChart 的右軸 margin | `ctx.state.createChartOptions.rightPriceScale.scaleMargins` deepEqual `{ top: 0.3, bottom: 0.3 }` |
| 4. score series 鎖定 0~10：呼叫 `scoreSeries.options.autoscaleInfoProvider()` 的回傳 | deepEqual `{ priceRange: { minValue: 0, maxValue: 10 } }` |
| 5. tooltip 契約：以 `[scoreSeries, { value: 6.5 }]` 觸發 `crosshairHandler`，tooltip HTML 應含「警示分數」與 `6.5` | 換軸不影響 tooltip 內容 |
| 6. Volume scale 維持原配置：`ctx.state.priceScaleApplyCalls.find(c => c.id === "volume")?.options` deepEqual `{ scaleMargins: { top: 0.8, bottom: 0 } }` | 鎖住「Volume 不變」的範圍承諾 |
| 7. 不再對 `"score"` 設 scale options：`ctx.state.priceScaleApplyCalls.find(c => c.id === "score")` 為 `undefined` | 確認舊 overlay 配置已移除 |

不寫「`chart.priceScale("score")` 不存在」這種測試 ─ Lightweight Charts 對任何 id 都會回傳 wrapper，測「不存在」會測錯東西。改測「沒有對 score id 呼叫 applyOptions」（用例 7）。

### Step 6 ─ 視覺驗收（preview）

搜尋 1101，預期：
- 左側 Y 軸顯示固定 0~10 的刻度（不會因當下 score 範圍縮放）
- 右側 Y 軸維持 K 棒股價刻度（25 上下）
- 黃線在圖表上方 5%~25%，K 棒在中段 30%~70%，Volume 在底部 80%~100% ─ 三者垂直分區
- crosshair / tooltip 顯示分數與股價的方式不變

**多 viewport 驗收**（雙軸會吃掉左右寬度，真正容易擠壓的是手機）：
- desktop（1280×800）：左右刻度 / range buttons / tooltip 不重疊
- tablet（768×1024）：同上 ─ 確認 K 棒繪製區仍可讀
- phone（390×844 或 430×932）：左右兩條軸標籤不重疊到 K 棒，range buttons 不被推到擠壓 / 換行

## 四、相容性與風險

* **無資料破壞**：純粹是 chart 渲染層面的軸位置調整，資料路徑（`fullPeriodScores` → `setRuleScoreOverlay` → `applyScoreOverlayData` → `series.setData`）完全不動
* **chart 寬度變化**：左軸新增會佔用容器內部約 50~60px 寬度，K 棒繪製區會變窄。`#kline-chart` 是響應式 width、ResizeObserver 已在 [js/charts/kline.js:127](../../js/charts/kline.js) 處理 ─ 但實作後**仍需 preview 驗證窄 viewport 沒有 layout 異常**
* **vendor 相依**：`vendor/lightweight-charts-4.standalone.production.js` 為 v4，`leftPriceScale` 從 v3 就支援，**低風險，但需 unit + preview 驗證**
* **測試**：[tests/kline.test.js:464](../../tests/kline.test.js) 既有的 priceScaleId assertion 必須改成 `"left"`；mock 須擴充 `global.LightweightCharts.createChart` 記錄 opts、以及 `chartApi.priceScale().applyOptions` 呼叫紀錄，否則 Step 5 用例 2、3、6、7 寫不出來

## 五、Out of scope（之後可考慮）

- 警示分數 0~10 的閾值區段顏色（例如 ≥ 7 紅、3~7 黃、≤ 3 綠）── 這份只動軸位置，配色另議
- 把 Volume 也搬左軸 ── 目前底部 overlay 已經夠用
- 加 left axis 標題「警示分數」── Lightweight Charts v4 沒有原生 axis title API，要 DOM 疊圖層，工作量較大；先做不加
