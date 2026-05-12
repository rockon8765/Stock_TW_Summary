# K 線警示分數改為階梯線 + 月度 cutoff 標記點（2026-05-12）

> **分支**：`feature/layout-claude`
> **Worktree**：`/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov`
> **範圍**：把 K 線圖上的警示分數黃線從「直線插值折線」改成「階梯線（WithSteps）+ 該月 cutoff 日實心圓點」，視覺上明確表達「每月一筆 cutoff 讀數，中間是承接，不是連續變化」。
> **不在範圍**：分數計算、左右雙軸位置、tooltip 內容、其他 chart 顏色 / 主題。

---

## 一、問題與動機

[js/charts/kline.js:147-160](../../js/charts/kline.js) 目前的 score series：

```js
const lineOptions = {
  color: "#fbbf24",
  lineWidth: 2,
  priceScaleId: "left",
  // 沒有 lineType → 預設 LineType.Simple，**直線插值**連接每筆資料
  ...
};
```

實際資料 cadence 是**月**（[js/lib/rule_engine.js](../../js/lib/rule_engine.js) 的 `fullPeriodScores`，每筆 `point.date` 是「該月最後可用交易日 / cutoff date」 ─ 通常是月底；若該月最後一天遇到假日 / 週末，會回退到該月最後一個交易日。注意 axis 已先用 `buildMonthEndAxis()` 排除尚未結束的當月，所以不會出現「當月未結束的 cutoff」）。但 `LineType.Simple` 在兩個月度 cutoff 讀數之間做直線插值，讓人誤以為「分數在月中也在動」。例如 cutoff 4/30 分數 8、下一個 cutoff 分數 5，目前折線會在中間任意一天顯示「線性下降到 6.5」，但實際上分數只在 cutoff 日重新計算。

## 二、設計

| 項目 | 改動 |
|------|------|
| **線型** | `lineType: LightweightCharts.LineType.WithSteps` ─ 階梯線，相鄰點之間「水平 → 垂直 → 水平」連接，視覺上每段是「該 cutoff 日分數，持有到下一個 cutoff 日」 |
| **標記點** | line series 內建選項：`pointMarkersVisible: true` + `pointMarkersRadius: 2` ─ 在每個有效資料點自動畫實心圓，明示「這裡是真實讀數」 |
| **顏色** | 點與線同色 `#fbbf24`（line series 自動繼承 `color`；不分閾值，避免擾動既有色彩語意；之後若要按 0~10 分段上色另案處理） |

**為什麼用 `pointMarkersVisible` 而不是 `setMarkers`**：
- `pointMarkersVisible` 是 line series 的內建 option，跟著 `setData()` 自動同步、range 切換不會 stale ─ 不需要每次 setData 後手動補一次 setMarkers
- `setMarkers` 適合「per-point 自訂形狀/文字/顏色」這類場景；只是「每點一個小圓」的話用 `pointMarkersVisible` 簡單得多
- 沒有 size clamp 風險：`pointMarkersRadius` 是像素半徑，2px 直徑 4px，5Y × 60 月在 1200px 寬度上仍可分辨（窄 viewport 仍可能擠壓，見第四章風險段）

要點：
- 階梯方向：v4 `WithSteps` 預設「保持上一筆值水平延伸到下一個 X，然後垂直跳到新值」，意義剛好是「該 cutoff 日分數持有到下個 cutoff 日前」 ─ v4 並未提供切換成另一方向的選項，所以這個方向就是固定行為
- 不需要動 `applyScoreOverlayData / reapplyScoreOverlay` 內的 `setData` 路徑

## 三、實作步驟

### Step 1 ─ score series 加上 WithSteps + 內建 point markers

```js
// js/charts/kline.js ensureScoreSeries()
function ensureScoreSeries() {
  if (!chart || scoreOverlaySeries) return;
  const lineOptions = {
    color: "#fbbf24",
    lineWidth: 2,
    lineType: LightweightCharts.LineType.WithSteps,   // ← 新增：階梯線
    pointMarkersVisible: true,                        // ← 新增：每點顯示
    pointMarkersRadius: 2,                            // ← 新增：半徑 2px
    priceScaleId: "left",
    priceFormat: { type: "custom", minMove: 0.1, formatter: formatScoreAxisTick },
    autoscaleInfoProvider: () => ({
      priceRange: { minValue: 0, maxValue: 10 },
    }),
  };
  // ...rest unchanged
}
```

`LightweightCharts.LineType` 在 vendor v4 已暴露為頂層 enum（`LineType.Simple = 0` 直線插值、`LineType.WithSteps = 1` 階梯、`LineType.Curved = 2` 曲線）。直接用 `LightweightCharts.LineType.WithSteps` 不需要額外 import。`pointMarkersVisible` / `pointMarkersRadius` 也是 line series 的標準 option（vendor 預設值 `pointMarkersVisible: false`）。

**API 範圍**：本計畫綁定**目前 bundled 的 `vendor/lightweight-charts-4.standalone.production.js`**。[js/charts/kline.js](../../js/charts/kline.js) 在 `ensureScoreSeries()` 內仍保留 `addLineSeries` legacy fallback 是為了相容更舊的 v3 build；如果未來真的要降版到沒有 `LineType` enum 的 build，就要在這裡也補一道 guard，例如 `lineType: LightweightCharts.LineType?.WithSteps ?? 1`。本次不為這個假想場景動程式。

### Step 2 ─ 不動 `applyScoreOverlayData / reapplyScoreOverlay`

因為 `pointMarkersVisible` 是 series option，會跟著 `setData()` 的資料自動畫點，range 切換時也是 `setData()` 重餵新資料、markers 自動同步 ─ **不需要任何手動 setMarkers 呼叫**。

### Step 3 ─ 測試

mock series（[tests/kline.test.js:67-78](../../tests/kline.test.js)）已經會記錄 `options`，不需擴充任何欄位（沒有用 `setMarkers`，所以也不用補 mock method）。

修改既有用例「renderKline configures rule score line on a fixed 0-10 visible left axis」：

```js
assert.equal(
  scoreSeries.options.lineType,
  LightweightCharts.LineType.WithSteps,
);
assert.equal(scoreSeries.options.pointMarkersVisible, true);
assert.equal(scoreSeries.options.pointMarkersRadius, 2);
```

並把 mock 的 `global.LightweightCharts` 物件加上 `LineType: { Simple: 0, WithSteps: 1, Curved: 2 }`。

新增測試**鎖定階梯線與資料點標記契約**（unit test 只能 assert option 值與資料過濾，不能直接證明視覺呈現；視覺由 Step 4 preview 把關）：

| 用例 | 期望 |
|------|------|
| 1. score series 的 `options.lineType === LightweightCharts.LineType.WithSteps` | 階梯線 option 契約 |
| 2. score series 的 `options.pointMarkersVisible === true` 且 `options.pointMarkersRadius === 2` | 內建點標記 option 契約 |
| 3. 餵入含 null score 的資料，`scoreSeries.data` 不包含 null 點 | 過濾邏輯維持原樣 |
| 4. 切換 range 到 3M 後，`scoreSeries.data` 只包含 3M 視窗內的點 | range 切換 setData 行為不變（既有測試已涵蓋；確認本次改動沒破壞）|

### Step 4 ─ 視覺驗收（preview）

搜尋 1101，預期：
- 黃線**呈階梯狀**（每段水平延伸到下一個 cutoff 日，再垂直跳到新值），不再平滑斜率
- 每個 cutoff 日（通常月底，遇假日為該月最後交易日）有一個**小實心圓點**疊在線上 ─ 視覺上「點是讀數、線是承接」
- range 切到 3M / 1Y / 5Y，點數量隨資料自動變化，位置永遠在 cutoff 日

`fitContent` / 範圍時間軸 / tooltip 行為皆不變。

## 四、相容性與風險

* **無資料破壞**：純粹是 series rendering option，資料路徑（`fullPeriodScores` → `setRuleScoreOverlay` → `applyScoreOverlayData`）不動
* **vendor 相依**：`vendor/lightweight-charts-4.standalone.production.js` 已驗證含 `LineType.WithSteps` 與 line series 的 `pointMarkersVisible`，**低風險**
* **窄 viewport 點密度**：5Y × 60 月在 1200px 寬度每點間距 ~20px，2px 半徑明顯可分；手機 390px 寬度間距 ~5px，2px 半徑會貼近相鄰點 ─ 仍可辨識，但**實作後需在 phone viewport preview 確認可讀性**，必要時改成 1px 或在 5Y 視窗考慮加大間距
* **測試**：既有 mock 不需擴充（沒有用 `setMarkers`）；只需把 mock `global.LightweightCharts` 加上 `LineType` enum

## 五、Out of scope（之後可考慮）

- Markers 按分數分色（≥ 7 紅、3~7 黃、< 3 綠）─ 與左軸 0~10 數值天然對應，但牽涉色彩語意決策；若要做，需改用 `setMarkers()` 才能 per-point 上色
- tooltip 加一行「📌 月度警示分數，每月最後可用交易日（cutoff）更新」說明 cadence
- 階梯方向反向（先垂直再水平）─ v4 沒有切換 option，要改只能改 vendor 或自己畫，超出範圍
