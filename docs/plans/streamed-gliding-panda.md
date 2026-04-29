# StockOnePage 前端全面審計與優化建議計畫

## Context（背景）

`StockOnePage` 是人壽業投資部使用的台股個股資訊一頁式網頁，採純靜態前端（vanilla JS ES modules + Tailwind CDN + Lightweight Charts v4），由 CMWebAPI（`data.dottdot.com`）取得即時行情、月營收、季損益、現金流、年度財報、技術統計等，並透過 `scorecard_web.json` 載入 ScoreCard 策略分數。

自上次審計（[docs/plans/gentle-sniffing-pike.md](docs/plans/gentle-sniffing-pike.md)，2026-04-17）以來，已新增多個模組（`dividend`, `cashflow`, `financial_ratios`, `risk_technical`, `insider_governance`, `long_term_trend`, `rule_alerts`, `strategy_scores`），並把 7 條 sell rules 在 JS 重新實作。需要重新驗證舊 bug 是否仍存在、新模組是否引入新 bug。

**本次任務目標（已與使用者校準）：**
1. 全面前端審計（js/、css/、index.html、scorecard 整合介面）
2. 不動程式碼，僅產出書面審計文件
3. 不納入 Python ScoreCard pipeline 範圍（待下一輪）
4. 嚴重度分級 + file:line 引用 + API 實測佐證 + 分階段建議

---

## 已驗證的核心發現（自上次 audit 以來的演進）

### ✅ 已修正
| 項目 | 上次發現 | 目前狀態 |
|---|---|---|
| C4 資本額單位 | `profile.js` capital `/1e8`（誤把百萬當元） | [profile.js:88](js/modules/profile.js:88) 已改 `/1e2`（百萬→億）✓ |
| ResizeObserver 洩漏 | `kline.js` 沒清理 observer | [kline.js:11-14](js/charts/kline.js:11) 已加 disconnect ✓ |
| risk_technical undefined | `latest = sortedAsc[length-1]` 無 guard | [risk_technical.js:54](js/modules/risk_technical.js:54) 已加 `\|\| {}` ✓ |
| Cashflow 單位換算 | (新模組) | [cashflow.js:60,90-93](js/modules/cashflow.js:60) 用 `* 1000` 從仟元→元再給 formatRevenue，正確 ✓ |
| 規則 chip 同時顯示 code + name | 過去多次反覆（commits f58569f / d1200c5） | [rule_alerts.js:39](js/modules/rule_alerts.js:39) 已用 `${dot} ${r.code} ${r.name}`，code 與名稱並陳 ✓ |

### ❌ 仍存在（必須在審計報告中標示）

#### 🔴 CRITICAL — 資料正確性錯誤（投資決策誤導）

| # | 發現 | 位置 | 顯示值 vs 真實值 |
|---|------|------|---|
| **C1** | **月營收欄位顯示為真實值 1/1000** — `formatRevenue(d['單月合併營收'])` 未換算單位。`formatRevenue` 假設輸入「元」（utils.js:11-17 用 `>=1e8 → 億`），但 monthsales API 是「仟元」 | [revenue.js:27](js/modules/revenue.js:27) | 2330 (2026/03) 應 4,151.92 億 → 實顯示 4.15 億 |
| **C2** | **累計營收同 C1** | [revenue.js:30](js/modules/revenue.js:30) | 同上 |
| **C3** | **季損益營收顯示為真實值 1/10** — `(r.rev / 1e4).toFixed(0) + ' 百萬'`。仟元 / 1e4 ≠ 百萬，應 `/1e3` | [income.js:39](js/modules/income.js:39) | 2330 2025Q4 應 1,046,090 百萬 → 實顯示 104,609 百萬 |
| **C5** | **`valClass` 對「水準型指標」上色語意錯誤** — 毛利率/營益率/淨利率/EPS 是「水準」非「變化」。30% 毛利率被塗紅（台股 up=紅）讓人誤以為「上升」；EPS 正值塗紅、負值塗綠視覺訊號顛倒。（注意：[strategy.js:99-100](js/modules/strategy.js:99) 對勝率與報酬率上色屬「績效結果型」紅好綠壞，與此 bug 不同類，不在 C5 範圍） | [income.js:40-43](js/modules/income.js:40) | 30% 毛利顯紅、虧損 EPS 顯綠 |

> **結論：C1–C3、C5 仍存在，營收三處數量級錯誤、EPS/利率語意錯誤，分析師看到的台積電月營收只有真實的 1/1000，現在頁面不可作為投資決策依據。**

#### 🟠 HIGH — 程式正確性與穩定度

| # | 發現 | 位置 | 影響 |
|------|------|------|------|
| H1 | **策略 CSV 載入失敗靜默吞掉錯誤** — `catch {}` 只把資料設為 `[]`，使用者看到「此股票無策略資料」而非「載入失敗」 | [strategy.js:61-64](js/modules/strategy.js:61) | 無法區分 ticker 無資料與網路錯誤 |
| H2 | **CSV 解析器不支援 quoted comma** — 簡單 `line.split(',')`，策略名稱含逗號會欄位錯位 | [strategy.js:14,16](js/modules/strategy.js:14) | 表格錯位 |
| H3 | **`innerHTML` 直接內插 API/CSV 字串** — 公司名稱、策略名稱、insider 欄位等若被污染會 XSS。共 30+ 處直接內插，無 `escapeHtml` 防禦 | 全部 module（範例：[insider_governance.js:71+](js/modules/insider_governance.js:71)、[profile.js:82,86,87](js/modules/profile.js:82)） | 潛在 XSS |
| H4 | **異常資料無 logging** — API 回傳非數值字串、`null`、缺欄位時，`formatNumber`/`formatPercent` 等只是靜默回 `—`，無 console.warn / telemetry。一旦 API schema 改動或某 ticker 資料缺漏，前端不會主動回報（注意：負值是合法值，會正常顯示如 `-5.0`，並非此 bug 範圍） | [utils.js:1-23](js/utils.js:1) | API 變更/異常無偵測 |
| H5 | **策略資料載入競態** — `loadStrategyData()` 在 [main.js:424](js/main.js:424) 是 fire-and-forget；若使用者立刻搜尋，[strategy.js:114-118](js/modules/strategy.js:114) 看到 `null` → 顯示「策略資料載入失敗」，下次搜尋才正確 | [main.js:424](js/main.js:424) | 早期搜尋偽錯誤 |
| H6 | **「不適用」與「fetch 失敗」共用同一個 UI 狀態** — 部分標的某些資料集結構上不適用（例如 ETF 沒有財報損益、權證沒有股東會資料），API 回 `success` + 空陣列；前端 `showError` 一律顯示「xxx 資料載入失敗」，與真正 fetch fail 混為一談。分析師無法判斷是 API 異常還是資料本不存在（H6 與 M6 同源，H6 強調 user-facing 訊息誤導，M6 強調缺乏統一處理機制） | [main.js:154-391](js/main.js:154) 各 try/catch 的 showError | 使用者誤判資料品質 |
| H7 | **策略分數 snapshot 只在第一次搜尋拉取，且失敗無重試** — [api.js:210-219](js/api.js:210) 失敗回 `null`，[main.js:131-147](js/main.js:131) 把 `strategySnapshotLoadedOnce` 永久設 `true`；之後切換 ticker 都看不到策略分數 | [main.js:131-147](js/main.js:131), [api.js:210-219](js/api.js:210) | 第一次失敗就永久壞掉 |
| H8 | **S22 規則用 Alpha250D 近似「與大盤比年報酬率」** — [rule_engine.js:151-157](js/lib/rule_engine.js:151) 註解明確說「Live API 沒有直接提供 ScoreCard pipeline 使用的 `與大盤比年報酬率(%)`，前端改用 Alpha250D 作為即時近似」；S22 的 JS 觸發條件 ≠ Python 的觸發條件 | [rule_engine.js:159-186](js/lib/rule_engine.js:159) | 前端 chip 顯示「警示」但 Python ScoreCard 認為沒事，反之亦然 |
| H9 | **S20 規則名稱與實作不符** — 名稱「單季營收連兩季衰退」但實作用「最近 2 個月的單月合併營收年成長 < 0」，月 vs 季混用 | [rule_engine.js:135-149](js/lib/rule_engine.js:135) | 警示語意不符、可能漏報或誤報 |

#### 🟡 MEDIUM — UX、可維護性、合規

| # | 發現 | 位置 | 影響 |
|------|------|------|------|
| M1 | **日期換算用 UTC** — `fiveYearsAgo()`、`today()` 用 `toISOString()`，台北 00:00–08:00 之間 `today()` 回傳前一天（5Y 區間左右各偏 1 天）| [api.js:18-26](js/api.js:18) | 邊界時段資料區間略偏 |
| M2 | **沒有「資料更新時間」顯示** — Footer [index.html:227](index.html:227) 只說「資料來源：CMWebAPI」，沒寫資料截止時間。法人合規通常要求標明 as-of | [index.html:227](index.html:227) | 合規/可信度問題 |
| M3 | **無 retry 機制** — [main.js](js/main.js) 各區塊失敗只顯示錯誤，不重試、不允許手動重試 | [main.js](js/main.js) 全部 try/catch | 偶發網路錯誤需重整整頁 |
| M4 | **K 線切 ticker 後 range button active class 不重設** — [kline.js:78](js/charts/kline.js:78) 每次強制 setRange("5Y") 但 button class 仍停留在前次 | [kline.js:78,137-145](js/charts/kline.js:78) | 小 UX 瑕疵 |
| M5 | **色盲不友善** — 漲跌僅紅綠，無箭頭/正負號文字。約 8% 男性可讀性差 | [css/style.css](css/style.css) `.val-up`/`.val-down` | 無障礙 |
| M6 | **部分資料標的缺乏「不適用」狀態的統一處理機制** — 真正不存在的 ticker（如 `9999`）已能在 [profile.js:50-53](js/modules/profile.js:50) 正確顯示「無公司資料」✓；但對結構上某些資料集不適用的標的（例：ETF 無季損益、權證無股東會），缺乏一個共用的 `showNotApplicable(reason)` helper，每個 module 各自使用 `showError`，導致 H6 描述的混淆 | 全部模組（缺 `showNotApplicable` helper） | 與 H6 同源，建議一起修 |
| M7 | **API key 'guest' 硬編於 [api.js:2](js/api.js:2)** — 與本機 `.env`（同樣 `CM_API_KEY=guest`）並存但無關聯（`.env` 未被前端讀取，純靜態頁無 build step）。`.env.example` 已被刪除（git status `D .env.example`），新人 clone 後不知道是否需要設定。建議：若不會被注入則移除 `.env`，若計劃改用 build-time 注入則補回 `.env.example` 並從 `js/api.js` 移除硬編 | [api.js:2](js/api.js:2)、`.env` | 維護不一致；雖為公開 key 不算 security 風險 |
| M8 | **API 沒有任何 caching** — 同 ticker 反覆查詢都打 15 個 endpoint。投資部分析師常在數十檔股票間切換 | [api.js](js/api.js) 全部 fetch | 效能與 API 額度浪費 |
| M9 | **getLatestQuote 用 `>` 比較字串日期** — 非 `localeCompare`，雖 ISO 格式 `YYYY-MM-DD` 字典序與時序一致，但缺乏防呆 | [profile.js:5-9](js/modules/profile.js:5) | 若 API 改格式即破 |
| M10 | **Skeleton 不可達性** — 全部 skeleton 是純 `div`，無 `aria-busy="true"`、`role="status"`、`aria-label`，screen reader 不知頁面正在載入 | [main.js:50-95](js/main.js:50)、[index.html](index.html) | 無障礙 |
| M11 | **input 缺 `<label>` 與 `<form>` 包裝** — [index.html:35-44](index.html:35) `<input id="ticker-input">` 無 label，按鈕沒包在 form 內，按 Enter 走自定 keydown handler 而非原生 submit | [index.html:35-44](index.html:35) | 無障礙、與螢幕閱讀器整合差 |
| M12 | **無 CSP header** — `index.html` 無 `Content-Security-Policy` meta，搭配 H3 的 `innerHTML` 風險加倍 | [index.html](index.html) | 安全 |

#### 🟢 LOW — 樣式、組織、可維護性

| # | 發現 | 位置 | 影響 |
|------|------|------|------|
| L1 | Skeleton HTML 樣板在 main.js 重複 | [main.js:50-95](js/main.js:50) | 維護性 |
| L2 | 中英混雜（程式 ID 英文、資料 key 中文）— 沒有 schema 文件 | 全部 | 新人上手 |
| L3 | 缺匯出 PDF / Excel / 截圖功能 | 整體 | 法人分析常需附在報告 |
| L4 | Tailwind、Lightweight Charts 用 CDN — production 應 pin version + SRI | [index.html:7,25](index.html:7) | 供應鏈風險 |
| L5 | **既有測試覆蓋偏 happy path** — `tests/utils.test.js`、`tests/rule_engine.test.js`、`tests/dividend_aggregator.test.js`、`tests/strategy_snapshot_contract.test.js` 都已存在，但需擴充：(a) 單位換算 edge case（仟元/百萬/億）；(b) `valClass` 對水準型 vs 變化型的區分；(c) `formatRevenue` 對極端值 | `tests/` | 重構回歸風險（既有測試本身堪用，只需擴充） |
| L6 | `style.css` 全用硬編色碼，無 CSS custom properties；換主題要 find-replace | [css/style.css](css/style.css) | 維護性 |
| L7 | **多模組重複實作 sort 與 helper** — `financial_ratios.js`、`cashflow.js`、`profile.js` 都有自己的 quarterly desc sort（用 `年季` localeCompare）；`long_term_trend.js` 另有 annual sort（用 `年度` 數值）。可抽 `sortDescByQuarter()` 與 `sortDescByYear()` 至 utils | [financial_ratios.js:4-8](js/modules/financial_ratios.js:4)、[cashflow.js:34-36](js/modules/cashflow.js:34)、[profile.js:27-29](js/modules/profile.js:27) | 可抽 utils |
| L8 | `strategy_scores.js` 每次 render 都重新 bind onclick handler（雖會被 GC，但不必要） | [strategy_scores.js](js/modules/strategy_scores.js) | 微效能 |
| L9 | `dividend.js`、`profile.js`、其他 module 多處 `Map.get()`、陣列 `[0]` 缺 explicit null 檢查（行為靠 `safeDiv` 安全但隱含） | [dividend.js:86](js/modules/dividend.js:86)、[profile.js:74](js/modules/profile.js:74) | 程式可讀性 |

---

## 已驗證但非錯誤的項目（避免誤殺）

- `.env` 已在 `.gitignore`、未進 git 歷史 ✓
- 紅漲綠跌色彩慣例符合台股，**對「漲跌變化」是正確的**（[profile.js:96-97](js/modules/profile.js:96) 用在 `change` 是對的）
- `Promise.allSettled` + 各區塊獨立 try/catch 設計合理 ✓
- `formatPercent` 正確假設輸入為 0-100 ✓
- `risk_technical.js` 對 `年化波動度250D` 與 `Alpha250D` 用 `* 100` 把 decimal 換成 % 是正確的 ✓
- `cashflow.js` 用 `* 1000` 把仟元 → 元再給 `formatRevenue` 是正確的 ✓
- `kline.js` 的 ResizeObserver 已正確 disconnect ✓
- 7 條 sell rules 在 JS 重新實作雖與 Python 有 divergence（H8, H9），但**在 Live API 場景下技術上可行**，主要是命名與一致性問題

---

## 優化建議（給未來執行的人）

### P0 — 立即修正（1–2 天，僅 bug fix，不動架構）

1. **修正 C1–C3 單位換算** — 在 [js/utils.js](js/utils.js) 新增單位常數與 helper：
   ```js
   export const UNIT = { THOUSAND_TO_BILLION: 1e5, THOUSAND_TO_MILLION: 1e3 };
   export function formatRevenueFromThousand(v) { /* 仟元 → 億 */ }
   ```
   - [revenue.js:27,30](js/modules/revenue.js:27) 改 `formatRevenueFromThousand(d['單月合併營收'])`
   - [income.js:39](js/modules/income.js:39) 改 `(r.rev / 1e3).toFixed(0) + ' 百萬'` 或 `(r.rev / 1e5).toFixed(2) + ' 億'`
2. **修正 C5 valClass 語意錯誤** — 對水準型指標改用中性色或拆分 `valClassLevel(value, threshold)` vs `valClassChange(delta)`
3. **修正 H1 策略 CSV 靜默吞錯誤** — `catch (err) { console.error('strategy load failed', err); strategyLoadFailed = true; holdingData = null; }`，[strategy.js:114-118](js/modules/strategy.js:114) 區分「無資料」與「載入失敗」
4. **加上「資料更新時間」於 Header（M2）** — 從 `data.quotes` 最新 `日期` 顯示
5. **加上 NaN / 異常 logging（H4）** — `formatNumber`/`formatPercent` 失敗時 `console.warn(field, value, ticker)`

### P1 — 一週內（HIGH 修補 + 健壯性）

6. **修正 H5 策略資料載入競態** — 把 `loadStrategyData()` 從 fire-and-forget 改成回傳 Promise，[main.js](js/main.js) 中 `search()` 開頭先 `await loadStrategyData()` 或在 [strategy.js:114-118](js/modules/strategy.js:114) 區分三態：「尚未載入」（顯示載入中 / 等待）、「載入失敗」（顯示重試）、「無此 ticker 資料」
7. **修正 H7 策略 snapshot 單次失敗永久壞掉** — 改用「每次搜尋若 `strategySnapshotData == null` 就重試」，或加上 30 分鐘 TTL
8. **加 retry 按鈕（M3）** — 每個失敗區塊顯示「重試」連結
9. **修正 H6 / M6 「不適用」與「失敗」共用 UI 狀態** — 在 [js/utils.js](js/utils.js) 新增 `showNotApplicable(el, reason)` helper（不同視覺：灰色提示 + icon「—」），各 module 在判斷「API 回 `success` 但 data 為空陣列」時改用此 helper；並在 [api.js](js/api.js) 區分 `data: []`（不適用）與 throw（失敗）。範例：ETF 點選後損益區塊顯示「ETF 無單獨損益表」而非「損益資料載入失敗」
10. **修正 H2 CSV parser** — 使用支援 quoted comma 的最小實作（10 行）或引入 PapaParse minified
11. **修正 H8/H9 規則命名與語意** — tooltip 顯示計算說明、註明「JS 即時計算 vs Python ScoreCard snapshot 可能略有差異」；H9 把 S20 名稱改為「單月營收連兩個月衰退」以符合實作
12. **加 `escapeHtml` helper 並用於所有 plain text innerHTML（H3）** — `js/utils.js` 加 `escapeHtml(s)`，所有 module 字串內插改用
13. **修正 K 線 range reset（M4）** — `renderKline()` 末段把 `5Y` button 加回 active class
14. **無障礙 quick wins（M10, M11）** — input 加 label、skeleton 加 aria-busy、按鈕 type="submit"

### P2 — 中期（2–4 週，新增功能與架構）

15. **API caching layer** — Map<ticker, {data, ts}>，10 分鐘 TTL，可大幅減少切 ticker 時的重複請求（M8）
16. **加 retry with exponential backoff** — `queryTable` 內建（500ms, 1s, 2s）
17. **拆 `formatRevenue` 與單位常數整理** — 解決長期單位混淆，並產出 `docs/api-units-reference.md` 對照表
18. **加 PDF / 截圖匯出**（L3）— html2canvas + jsPDF
19. **擴充既有單元測試覆蓋**（L5）— 在現有 `tests/utils.test.js`、`tests/rule_engine.test.js`、`tests/dividend_aggregator.test.js` 上補：(a) 單位換算 edge case；(b) `valClass` 拆分後的測試；(c) `formatRevenueFromThousand`
20. **Tailwind production build + Lightweight Charts pin version + SRI**（L4）
21. **CSP meta + `escapeHtml` 雙保險**（M12 + H3）
22. **CSS custom properties 抽出**（L6）— `:root --color-up / --color-down / --color-muted` 等
23. **抽出共用 sort helper**（L7）— `js/utils.js` 加 `sortDescByQuarter()` / `sortDescByYear()`，移除多模組重複實作

---

## 本次任務交付物（僅文件，不動程式碼）

| 檔案 | 內容 | 預估字數 |
|------|------|---|
| `docs/plans/streamed-gliding-panda.md` | **本份計畫書本身**（從 `~/.claude/plans/` 複製到專案內），與既有 `docs/plans/gentle-sniffing-pike.md` 並列 | (本檔) |
| `docs/audit/2026-04-17-frontend-audit.md` | 詳細前端審計報告，含上述所有發現的 file:line、API 實測單位佐證、修正 diff 範例 | ~3,500 |
| `docs/audit/2026-04-17-optimization-plan.md` | 三階段優化建議（P0/P1/P2）與工時估計、依賴關係、驗證方式 | ~1,500 |
| `docs/audit/2026-04-17-api-units-reference.md` | API 欄位單位對照表（從本次與上次實測歸納），可作為未來重構的種子 | ~600 |

> 三份審計文件統一放在新建的 `docs/audit/` 目錄；計畫書複製到 `docs/plans/`，與專案中既有規劃並列。
>
> **儲存路徑說明**：Plan mode 限制只能寫入 `~/.claude/plans/streamed-gliding-panda.md`。Approve 後第一個動作將是 `cp` 這份計畫書到 `docs/plans/streamed-gliding-panda.md`，之後才開始建立 `docs/audit/` 三份審計文件。

---

## 關鍵檔案清單（供審計報告引用）

**前端核心：**
- [index.html](index.html) — 入口、結構、CDN 引入
- [css/style.css](css/style.css) — 設計系統
- [js/main.js](js/main.js) — 應用 bootstrap、區塊調度
- [js/api.js](js/api.js) — API 層
- [js/utils.js](js/utils.js) — 通用 helper、`FIELD` 常數、`formatRevenue`、`valClass`

**有 CRITICAL bug 的 module：**
- [js/modules/revenue.js](js/modules/revenue.js) — C1, C2
- [js/modules/income.js](js/modules/income.js) — C3, C5
- [js/modules/strategy.js](js/modules/strategy.js) — H1, H2（注意：strategy.js 的 valClass 用法不屬於 C5，那是「績效結果型」紅好綠壞，正確）

**有 HIGH 議題的 module：**
- [js/lib/rule_engine.js](js/lib/rule_engine.js) — H8（S22 Alpha250D 近似）、H9（S20 月/季混用）
- [js/modules/insider_governance.js](js/modules/insider_governance.js) — H3（XSS 風險最高）
- [js/charts/kline.js](js/charts/kline.js) — M4（range button reset）

**新增模組（已較佳但仍有 LOW 議題）：**
- [js/modules/dividend.js](js/modules/dividend.js)
- [js/modules/cashflow.js](js/modules/cashflow.js) ✓ 單位處理正確
- [js/modules/financial_ratios.js](js/modules/financial_ratios.js)
- [js/modules/risk_technical.js](js/modules/risk_technical.js) ✓ % 換算正確
- [js/modules/long_term_trend.js](js/modules/long_term_trend.js)
- [js/modules/strategy_scores.js](js/modules/strategy_scores.js)
- [js/lib/dividend_aggregator.js](js/lib/dividend_aggregator.js)

---

## 驗證方式（給未來執行 P0 修正的人）

1. **本機啟動**：`python3 -m http.server 8000` 後瀏覽 `http://localhost:8000`
2. **Smoke test ticker**：
   - `2330`（台積電，本次驗證基準，C1–C3 修正後對照）
   - `2317`（鴻海，傳產）
   - `1101`（水泥，配息）
   - `2884`（玉山金，銀行業，FCF 應 N/A）
   - `0050`（ETF，部分資料集不適用，**驗證 H6/M6**「不適用 vs 失敗」狀態正確區分）
   - `9999`（不存在，**僅驗證既有「無公司資料」訊息維持不變**，非 H6 的測試 case）
3. **單位修正後 2330 應呈現**：
   - 月營收（2026/03）4,151.92 億或 415,192 百萬
   - 季損益（2025Q4）營收 10,460.9 億或 1,046,090 百萬
   - 資本額 2,593.25 億 ✓（已正確）
   - 總市值 540,692.6 億 ✓（已正確）
   - 收盤 2,085 元、漲幅 0.24% ✓
4. **跨瀏覽器** Chrome、Safari、Edge 桌面、iPad 直橫
5. **A11Y** Lighthouse accessibility ≥ 90
6. **Console** 應無未捕捉錯誤

---

## 本次任務不會做的事（明確界定）

- ❌ 不修改任何 `.js` / `.html` / `.css` 程式碼
- ❌ 不執行 `git commit` / `git push`
- ❌ 不修改 `package.json` 或安裝 dependency
- ❌ 不啟動 dev server 與 preview
- ❌ 不審視 Python ScoreCard pipeline（待下一輪）
- ✅ 僅在新建的 `docs/audit/` 目錄產出 3 份 markdown 文件
