# 網頁顯示數字 vs 公開資料源 比對計畫（2026-05-06）

> **分支**：`feature/layout-claude`
> **Worktree**：`/Users/yoga/Desktop/FG_quant_report/StockOnePage/.claude/worktrees/eager-liskov`
> **目的**：驗證 `index.html` 上每一個顯示給使用者的數字／文字是否與公開可靠的台股資料源一致。資料源 API（[data.dottdot.com](https://data.dottdot.com/docs)）由本專案自建，需確認其數值與外部權威來源相符，且前端 transform（單位、TTM、YoY、CAGR…）邏輯正確。
> **不在範圍**：純前端視覺、樣式、效能、a11y。

---

## 一、執行摘要

| 項目 | 數量 |
|------|-----:|
| UI 顯示欄位（去除文字標籤）| 約 95 項 |
| **Tier A** 可直接與單一公開源比對 | 35 項 |
| **Tier B** 可比對但需重建（TTM／CAGR／rolling YoY 等聚合，含 margin 公式輸入驗證）| 30 項 |
| **Tier C** 無公開源、為自建衍生指標（規則評分、策略分數、PE 語意）| 15 項 |
| **Tier D** 文字／日期屬性（公司名、董事長、上市日…）| 16 項 |

**核心原則**：
1. Tier A、B 用程式抓公開 API + 對 dottdot 同 ticker 同期 raw value，逐欄比對
2. Tier B 額外驗證前端 transform（除以 1000、× 100、TTM 加總…）
3. Tier C 列入「人工確認清單」，附上計算定義與 sample ticker 結果，由使用者覆核
4. Tier D 用一次性目視抽檢（公司名通常 1 ticker 1 條紀錄）

---

## 一·五、目前資料契約（Section → Dataset Matrix）

> 在比對前先鎖定**頁面實際抓哪些 dataset**，避免漏驗或誤對。
> 來源：[js/main.js L247-269](../../js/main.js)，每次查詢都會並行抓 15 個 dottdot table + 1 個 scorecard 快照 + 2 個策略 CSV。

### 1.5.1 dottdot 個股資料表（共 15 張）

| key（main.js）| dottdot table | 用於哪個 UI Section / Module |
|--------------|---------------|---------------------------|
| `quotes` | `md_cm_ta_dailyquotes` | profile, kline, stock_summary, rule_engine S17（PB 百分位用 `股價淨值比`）/ S22（用 `收盤價`）|
| `profile` | `bd_cm_companyprofile` | profile（公司基本資料）|
| `sales` | `md_cm_fi_monthsales` | revenue, stock_summary（TTM YoY）, rule_engine S10/S20 |
| `income` | `md_cm_fi_is_quarterly` | valuation（季度財務）, profile（EPS 近 4 季）, rule_engine S11/S12/S13 |
| `bs` | `md_cm_fi_bs_quarterly` | profile（每股淨值）, financial_ratios |
| `dividend` | `md_cm_ot_dividendpolicy` | dividend, stock_summary（殖利率）|
| `foreign` | `md_cm_fd_foreigninsttrading` | institutional |
| `trust` | `md_cm_fd_investmenttrusttrading` | institutional |
| `broker` | `md_cm_fd_brokertrading` | institutional |
| `shareholders` | `md_cm_fd_stockholderstructure` | shareholders |
| `cashflow` | `md_cm_fi_cf_quarterly` | cashflow, financial_ratios |
| `stats` | `md_cm_ta_dailystatistics` | risk_technical（Beta/Alpha/波動度/乖離率 + 月 K9/D9/RSI10/MACD），rule_engine S22（用 `Alpha250D`）。**K 線本身不直接吃 stats**（K 線 series 來自 `quotes`），月技術指標表才用 stats |
| `insider` | `md_cm_fd_insiderholdingstructure` | insider_governance |
| `annualIs` | `md_cm_fi_is_annual` | long_term_trend，dividend（年度發放率 = 年度現金股利 / 年度 EPS，[dividend.js:37,61](../../js/modules/dividend.js)）|
| `annualBs` | `md_cm_fi_bs_annual` | long_term_trend |

### 1.5.2 非 dottdot 來源

| 來源 | 檔名 | 用於 |
|------|------|------|
| ScoreCard 快照 | `scorecard_web.json` | strategy_scores（自建 Python pipeline 產出）|
| 策略持有摘要 | `strategy_ticker_holding_summary.csv` | strategy（勝率／報酬／持有天數）|
| 策略交易摘要 | `strategy_ticker_trade_analysis_summary.csv` | strategy |

> **比對策略**：
> - 15 個 dottdot table → 公開源（TWSE / MOPS / TDCC）
> - 3 個自建來源（ScoreCard、CSV）→ **無外部公開源**，全列 Tier C

---

## 二、公開可靠資料源清單

### 2.1 第一級（官方／法定揭露）

| 來源 | URL | 涵蓋 | 認證等級 |
|------|-----|------|---------|
| **TWSE 台灣證券交易所** | <https://www.twse.com.tw/> | 上市日報價、市值、本益比、殖利率、成交量 | ⭐⭐⭐ 官方 |
| **TWSE OpenAPI** | <https://openapi.twse.com.tw/> | 每日 OHLCV、本益比、淨值比、殖利率（JSON）| ⭐⭐⭐ 官方 |
| **MOPS 公開資訊觀測站** | <https://mops.twse.com.tw/> | 財報（BS/IS/CF）、月營收、股利、董監持股、現金增資 | ⭐⭐⭐ 法定揭露 |
| **TPEx 證券櫃檯買賣中心** | <https://www.tpex.org.tw/> | 上櫃股票報價、財報、籌碼 | ⭐⭐⭐ 官方 |
| **TDCC 集保結算所** | <https://www.tdcc.com.tw/portal/zh/smWeb/qryStock> | 集保戶股權分散表（依持股級距）| ⭐⭐⭐ 官方 |

### 2.2 第二級（聚合，可用於交叉驗證）

| 來源 | URL | 用途 |
|------|-----|------|
| Yahoo Finance Taiwan | <https://tw.stock.yahoo.com/> | 報價、技術指標（10 年內）|
| Goodinfo 台灣股市資訊網 | <https://goodinfo.tw/> | 月營收、財報、籌碼、ROE/ROA、CAGR（已做聚合）|
| 鉅亨網 / CMoney / 元大 | — | 當日交叉驗 PE / PB |
| Wikipedia | — | 公司基本資料（董事長、成立日期等）|

### 2.3 三大法人 / 公司治理

| 用途 | 來源 |
|------|------|
| 外資／投信／自營商買賣超 | TWSE 「[三大法人買賣金額統計表](https://www.twse.com.tw/rwd/zh/fund/BFI82U)」 |
| 個股法人買賣超 | TWSE 「[三大法人買賣超日報](https://www.twse.com.tw/rwd/zh/fund/T86)」 |
| 內部人持股、設質 | MOPS 「[公司治理 → 董監持股餘額明細](https://mops.twse.com.tw/mops/web/t56sb01)」 |
| 股東會、股利、除權息 | MOPS 「[股利分派情形](https://mops.twse.com.tw/mops/web/t05st09_2)」 |

---

## 三、Sample Tickers 設計

為涵蓋邊界情境，固定 6 檔代號做完整比對：

| Ticker | 類別 | 特性 | 為什麼選 |
|--------|------|------|---------|
| **2330** | 一般大型股 | 半導體 | 資料完整、媒體報導密集，外部交叉驗證容易 |
| **2317** | 一般大型股 | 電子零組件 | 鴻海，獲利波動有，YoY 比較有變化 |
| **2412** | 高殖利率 | 電信 | 殖利率／配息穩定，長期 CAGR 適合驗證 |
| **2882** | 金融股 | 金控 | 財報科目特殊（無毛利率／營業利益概念），驗證金融類降級 |
| **0050** | ETF | 指數 ETF | 多數財務欄位缺值，驗證 `—` 降級邏輯 |
| **9999** | 無效 | 不存在 | 驗證錯誤與空狀態 |

> 額外（可選）：**2603 長榮**（航運週期）、**6488 環球晶**（中型股）作為延伸樣本。

---

## 四、欄位比對矩陣（Tier A — 可直接比對）

> **方法**：抓 dottdot raw value，再到對應公開源查同 ticker / 同日期 / 同期值，比對絕對誤差。
> **容差**：報價類 ±0.01；比率類 ±0.5pp；金額類 ±0.5%；張數類 ±0（必須完全一致）。

### 4.1 公司基本資料（profile.js）

| UI 標籤 | dottdot 欄位 | 公開源 | 比對方法 |
|--------|-------------|--------|---------|
| 股票代號 | 股票代號 | TWSE OpenAPI `/v1/exchangeReport/STOCK_DAY_AVG_ALL` | 字串相等 |
| 股票名稱 | 股票名稱 | TWSE 同上 | 字串相等 |
| 產業名稱 | 產業名稱 | TWSE 「[上市公司產業類別](https://www.twse.com.tw/rwd/zh/api/codeQuery)」 | 字串相等 |
| 公司名稱 | 公司名稱 | MOPS `t05st03` 公司基本資料 | 字串相等（含「股份有限公司」尾綴）|
| 董事長 | 董事長 | MOPS `t05st03` | 字串相等 |
| 資本額 | 實收資本額（百萬元）→ 億元 | MOPS `t05st03` 實收資本額 | 數值 ±0.01 億 |
| 上市日期 | 上市日期 | TWSE 公開資料 | 字串相等 |

### 4.2 報價／估值（profile.js, kline.js）

| UI 標籤 | dottdot 欄位 | 公開源 | 比對方法 |
|--------|-------------|--------|---------|
| 收盤價 | 收盤價 | TWSE 個股月行情 `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date={YYYYMMDD}&stockNo={ticker}&response=json` 或全市場單日 OpenAPI `/v1/exchangeReport/STOCK_DAY_ALL` | ±0.01 元 |
| 開盤 / 高 / 低 | 開盤價 / 最高價 / 最低價 | TWSE 同上 | ±0.01 元 |
| 漲跌 | 漲跌 | TWSE 同上 | ±0.01 |
| 漲幅 | 漲幅（%）| 自算（漲跌 / 前收）| ±0.01% |

> **TWSE OpenAPI 注意**：`/v1/exchangeReport/STOCK_DAY` 已停用（302 → 404）。
> 個股單檔月行情用 `rwd/zh/afterTrading/STOCK_DAY`；全市場單日用 OpenAPI `STOCK_DAY_ALL`；本益比/淨值比/殖利率用 OpenAPI `BWIBBU_d`。
| 成交量（K 線 series）| 成交量_股 | TWSE 同上「成交股數」 | **完全一致（皆股數，免換算）**；UI tooltip 顯示「張」是 `/1000` 後再格式化（[js/charts/kline.js:190](../../js/charts/kline.js)），驗證時用 raw 股數對 raw 股數 |
| 本益比 PE | dottdot `本益比` | **無單一公開直接對應** — 改列 Tier C 待釐清語意 | — |
| 本益比 PE₄(預估) | dottdot `本益比4` | TWSE OpenAPI `/v1/exchangeReport/BWIBBU_d` 的「本益比」欄位 | ±0.1 倍 |
| 股價淨值比 PB | 股價淨值比 | TWSE 同上 `BWIBBU_d` | ±0.01 倍 |
| 殖利率（歷史）| 殖利率 | TWSE 同上 `BWIBBU_d` | ±0.01% |

> **PE 欄位語意釐清（重要）**
> 經抽查 2330 在 2026-05-05：TWSE BWIBBU_d 本益比 = 33.97；dottdot `本益比4` = 34.0；dottdot `本益比` = 22.7。
> 推論：dottdot `本益比4` ≈ TWSE 公布的 **trailing 4 季 PE**（與收盤 / 近 4 季 EPS 一致：2250 / 66.24 ≈ 34.0）。
> dottdot `本益比` 22.7 對應的 EPS = 2250 / 22.7 ≈ 99.1，**非公開可查**，可能是 forward / 內部模型 EPS。
> **行動**：將 dottdot `本益比` 列入 Tier C 第 C15 項，由長官確認其商業定義後再決定如何驗證；UI 標籤「PE」與「PE₄(預估)」名稱也建議重新檢視（目前的「PE 22.7」+「PE₄(預估) 34.0」直覺上會被誤解為「現值 22.7 vs 預估 34.0」，但實際上 22.7 才是來路不明的那條）。
| 總市值 | 總市值（億元）| TWSE 「[個別證券交易資訊](https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY)」 + 公司股本 | ±0.5% |
| 週轉率 | 週轉率 | TWSE 同上 | ±0.01% |

### 4.3 財報科目（valuation.js）

> **重要**：valuation.js 表格顯示「年季 / 營收淨額 / 毛利率 / 營益率 / 淨利率 / EPS / 每股淨值」（[valuation.js:60-70](../../js/modules/valuation.js)）。
> 原始金額（營業毛利／營業利益／稅後純益）**沒有直接顯示在 UI**，只是 margin 公式的中間值。
> 因此這裡只列**直接顯示**的欄位；金額類驗證移到 Tier B 5.2 作為 margin 計算輸入驗證。

| UI 標籤（直接顯示）| dottdot 欄位 | 公開源 | 比對方法 |
|--------|-------------|--------|---------|
| 營收淨額（億）| 營業收入淨額（仟元 → 億）| MOPS `t164sb04` 季合併損益表 | ±0.5 億 |
| EPS | 每股稅後盈餘 | MOPS 同上 | ±0.01 元 |
| 每股淨值 | 每股淨值 | MOPS `t164sb03` 季合併資產負債表 | ±0.01 元 |

### 4.4 月營收（revenue.js）

| UI 標籤 | dottdot 欄位 | 公開源 | 比對方法 |
|--------|-------------|--------|---------|
| 單月營收 | 單月合併營收（仟元 → 億）| MOPS 「[每月營業收入彙總表](https://mops.twse.com.tw/mops/web/t05st10_2)」 | ±0.01 億 |
| MoM% | 單月合併營收月變動 | MOPS 同上 | ±0.01% |
| 單月 YoY% | 單月合併營收年成長 | MOPS 同上 | ±0.01% |
| 累計營收 | 累計合併營收 | MOPS 同上 | ±0.01 億 |
| 累計 YTD YoY% | 累計合併營收成長 | MOPS 同上 | ±0.01% |

### 4.5 現金流量表（cashflow.js）

> UI 表頭：「年季 / 營業活動 (OCF) / 投資活動 (ICF) / 融資活動 / 自由現金流量」（[cashflow.js:80-84](../../js/modules/cashflow.js)）。
> `發放現金股利` 不直接顯示，是 FCF 股利覆蓋倍數的分母 input → 移到 Tier B 5.2 作為 input 中間驗證。

| UI 標籤 | dottdot 欄位 | 公開源 | 比對方法 |
|--------|-------------|--------|---------|
| 營業活動 OCF（億）| 營業活動現金流量 × 1000 → 億 | MOPS `t164sb05` 合併現金流量表 | ±0.5 億 |
| 投資活動 ICF | 投資活動現金流量 | MOPS 同上 | ±0.5 億 |
| 融資活動 | 融資活動現金流量 | MOPS 同上 | ±0.5 億 |
| 自由現金流量 | 自由現金流量 | MOPS 計算（OCF − CapEx）或 dottdot 直接欄位 | ±1.0 億 |

### 4.6 股利政策（dividend.js）

> **注意**：UI 表頭為「年度 / 現金股利 / 股票股利 / 股利合計 / 年度現金殖利率 / 年度發放率 / 除息日」（[dividend.js:80-86](../../js/modules/dividend.js)）。
> `年度現金股利` / `年度股票股利` 並非 dottdot raw 欄位，而是由 [dividend_aggregator.js](../../js/lib/dividend_aggregator.js) 把季頻 `現金股利合計 / 股票股利合計` 同年度加總出來 → **移到 Tier B 5.6 聚合驗證**。
> `除權日` 目前未顯示，移除。
> 本節 Tier A 只保留：(a) 季頻 raw 欄位的逐筆抽查；(b) `除息日` 字串。

| UI 標籤 | dottdot 欄位 | 公開源 | 比對方法 |
|--------|-------------|--------|---------|
| 季頻 raw `現金股利合計`（單季）| 現金股利合計 | MOPS [股利分派](https://mops.twse.com.tw/mops/web/t05st09_2) | ±0.01 元（抽查 6 檔近 8 季）|
| 季頻 raw `股票股利合計`（單季）| 股票股利合計 | MOPS 同上 | ±0.01 元（抽查同上）|
| 除息日 | 除息日 | MOPS 同上 | 字串相等 |

### 4.7 籌碼（institutional.js）

| UI 標籤 | dottdot 欄位 | 公開源 | 比對方法 |
|--------|-------------|--------|---------|
| 外資買賣超（張）| 外資買賣超 | TWSE [T86](https://www.twse.com.tw/rwd/zh/fund/T86)「買賣差額（股）」 | **單位不同必須換算**：`dottdot 張 × 1000 == TWSE 股數` |
| 投信買賣超（張）| 投信買賣超 | TWSE 同上 | 同上換算 |
| 自營商買賣超（張）| 自營商買賣超 | TWSE 同上 | 同上換算 |
| 自營商買賣超_自行買賣（張）| 自營商買賣超_自行買賣 | TWSE 同上 | 同上換算 |
| 外資持股比率 | 外資持股比率 | TWSE [外資持股比率](https://www.twse.com.tw/rwd/zh/fund/MI_QFIIS) | ±0.01% |
| 投信持股比率 | 投信持股比率 | TWSE 同上 / Goodinfo 法人庫存 | ±0.05%（公開源較少直接公布，需交叉驗）|

> **單位陷阱**：TWSE T86 一律以「股」為單位，dottdot 法人買賣超則為「張」（1000 股）。比對腳本必須做 `× 1000` 轉換，否則會誤報全部不一致。

### 4.8 股權分散（shareholders.js）

| UI 標籤 | dottdot 欄位 | 公開源 | 比對方法 |
|--------|-------------|--------|---------|
| 1000 張以上 % | 1000張以上佔集保比率 | TDCC [集保戶股權分散表](https://www.tdcc.com.tw/portal/zh/smWeb/qryStock) | ±0.01% |
| 400 張以上 % | 400張以上佔集保比率 | TDCC 同上 | ±0.01% |
| 100 張以下 % | 100張以下佔集保比率 | TDCC 同上 | ±0.01% |
| 100~400 張 %（衍生）| `Math.max(0, 100 − 400張以上佔比 − 100張以下佔比)` 反推中段（[shareholders.js:11-14](../../js/modules/shareholders.js)）| TDCC 同上（同檔反推）| ±0.02pp（雙方各自計算誤差累加）|
| 各級距週變化（pp）| 同欄當週 − 上週 | TDCC 同上（連續兩週）| ±0.01pp |

### 4.9 內部人（insider_governance.js）

| UI 標籤 | dottdot 欄位 | 公開源 | 比對方法 |
|--------|-------------|--------|---------|
| 董監持股 % | 董監持股比例 | MOPS [董監持股餘額](https://mops.twse.com.tw/mops/web/t56sb01) | ±0.01% |
| 董監持股增減（pp）| 董監持股比例增減 | MOPS 同上（前後月份相減）| ±0.02pp |
| 經理人持股 % | 經理人持股比例 | MOPS 同上 | ±0.01% |
| 經理人持股增減（pp）| 經理人持股比例增減 | MOPS 同上 | ±0.02pp |
| 大股東持股 % | 大股東持股比例 | MOPS [大股東持股餘額](https://mops.twse.com.tw/mops/web/t57sb01) | ±0.01% |
| 大股東持股增減（pp）| 大股東持股比例增減 | MOPS 同上 | ±0.02pp |
| 董監設質比例 | 董監設質比例 | MOPS [董監股票設質](https://mops.twse.com.tw/mops/web/t57sb01) | ±0.01% |
| 經理人設質比例 | 經理人設質比例 | MOPS 同上 | ±0.01% |
| 大股東設質比例 | 大股東設質比例 | MOPS 同上 | ±0.01% |

---

## 五、欄位比對矩陣（Tier B — 需重建）

> **方法**：除了比對公開源同期 raw value，還要驗證前端聚合公式。
> **驗證流程**：
> 1. 先比對 raw（同 Tier A）
> 2. 用獨立計算（pandas／Excel）重建 transform，與 UI 顯示比對
> 3. UI 計算偏差 > 容差時，定位是 dottdot 上游錯，還是前端 transform 邏輯錯

### 5.1 TTM／rolling 聚合

| UI 標籤 | 公式 | 來源欄位 | 驗證重建 |
|--------|------|---------|---------|
| EPS（近 4 季）| Σ 4Q `每股稅後盈餘` | `md_cm_fi_is_quarterly` | 由 MOPS 4Q EPS 加總 |
| EPS TTM YoY（敘述句用）| (Σ 最近 4Q EPS − Σ 前 4Q EPS) / abs(Σ 前 4Q EPS) | `md_cm_fi_is_quarterly` 8 季 | 由 MOPS 8Q EPS 重建 |
| 12M TTM 營收 YoY | (Σ 最近 12M − Σ 前 12M) / Σ 前 12M | `md_cm_fi_monthsales` | 由 MOPS 24 個月營收重建 |
| 3M YoY | (Σ 最近 3M − Σ 去年同期 3M) / Σ 去年同期 3M | `md_cm_fi_monthsales` | **不是把三個 YoY% 相加**；需 current 3M + 去年對應 3M（共 15 個月覆蓋區間）— 對齊 [revenue.js:33-38](../../js/modules/revenue.js) `computeRollingYoy` |
| 1M / 3M 報酬 | (今收 − Nm 前收) / Nm 前收 | `md_cm_ta_dailyquotes.收盤價` | 由 TWSE 還原權息收盤價重建（**注意：是否該用權息還原價需與長官確認**）|

### 5.2 比率（financial_ratios.js, valuation.js）

> **驗證流程（margin 類）**：先把分子（營業毛利／營業利益／稅後純益）對 MOPS 比對 raw（容差 ±0.5 億），確保 input 正確；再驗 UI 算出的比率 = raw 重算結果（容差 ±0.05pp）。

| UI 標籤 | 公式 | 重建來源 | 中間 input 驗證 |
|--------|------|---------|---------|
| 毛利率 | 營業毛利淨額 / 營業收入淨額 × 100 | MOPS IS 該季 | 營業毛利淨額 ±0.5 億 |
| 營益率 | 營業利益 / 營業收入淨額 × 100 | MOPS IS 該季 | 營業利益 ±0.5 億 |
| 淨利率 | 稅後純益 / 營業收入淨額 × 100 | MOPS IS 該季 | 稅後純益 ±0.5 億 |
| ROE TTM | Σ 4Q 母公司業主稅後純益 / 平均母公司業主權益 × 100 | MOPS BS + IS 4Q | 4Q 母公司業主稅後純益、期初／期末母公司業主權益 |
| ROA TTM | Σ 4Q 稅後純益 / 平均資產總計 × 100 | MOPS BS + IS 4Q | 4Q 稅後純益、期初／期末資產總計 |
| 負債比 | 負債總計 / 資產總計 × 100 | MOPS BS 最新季 | 負債總計、資產總計 |
| 流動比 | 流動資產 / 流動負債 | MOPS BS 最新季 | 流動資產、流動負債 |
| 利息保障倍數 | (TTM 稅前 + TTM 利息費用) / TTM 利息費用 | MOPS IS 4Q | 4Q 稅前淨利、4Q 利息費用 |
| FCF 股利覆蓋 | TTM FCF / abs(TTM 發放現金股利) | MOPS CF 4Q | 4Q 自由現金流、4Q 發放現金股利 |
| 年度殖利率 | 年度現金股利 / 年末收盤價 × 100 | MOPS 股利 + TWSE 年末收盤 | 兩者 raw |
| 年度發放率 | 年度現金股利 / 年度 EPS × 100 | MOPS 股利 + IS 年報 | 兩者 raw |

### 5.3 5 年 CAGR（long_term_trend.js）

| UI 標籤 | 公式 | 重建來源 |
|--------|------|---------|
| 營收 5Y CAGR | (end / start)^(1/5) − 1 | MOPS IS 年報 5 年 |
| EPS 5Y CAGR | 同上 | MOPS IS 年報 5 年 |
| 現金股利 5Y CAGR | 同上 | MOPS 年股利 5 年 |
| 權益 5Y CAGR | 同上 | MOPS BS 年報 5 年 |
| 年度 ROE | 母公司業主稅後純益 / avg(equity) × 100 | MOPS IS + BS 年報 |
| 年度 ROA | 稅後純益 / avg(asset) × 100 | MOPS IS + BS 年報 |

### 5.4 技術指標（risk_technical.js, kline.js）

| UI 標籤 | 公式（推測）| 重建來源 |
|--------|------------|---------|
| Beta 250D | 個股 vs 大盤 250 日報酬迴歸 | TWSE 250 日歷史 + 大盤指數 |
| Beta 65D | 個股 vs 大盤 65 日報酬迴歸 | TWSE 65 日歷史 + 大盤指數 |
| 年化波動度 250D | √(252) × σ(daily return) | TWSE 250 日 |
| Alpha 250D | 個股 250D 報酬 − Beta × 大盤 250D 報酬 | 同上 |
| 乖離率 250 日 | (今收 − MA250) / MA250 × 100 | TWSE 250 日 |
| 月 K9 / D9 / RSI10 / MACD | 標準技術指標公式 | TWSE 月 K + 公式重算 |

> **注意**：技術指標公式有不同流派（Wilder vs SMA 平滑等）；驗證時請以**公式而非結果**比對，並在備註寫明所採流派。

### 5.5 規則 / 篩選邏輯（rule_engine.js）

> **重要設計前提**：rule_alerts UI 區塊在 [index.html](../../index.html) 明確標示為「Live API 近似訊號」，**不承諾與 Python ScoreCard export 完全一致**。
> 因此驗證目標**不是**「警示輸出相同」，而是：
> 1. **公式定義驗證**：每條 rule 在 rule_engine.js 的判斷式是否符合書面定義
> 2. **差異記錄**：對照 ScoreCard pipeline 的對應 rule，列出**已知設計差異**並文件化（既有 audit H8、H9 已標記 S20、S22 為已知）
> 3. **input 正確性驗證**：rule 用到的 dottdot 欄位 raw value 對公開源 ±容差

| 規則 | 邏輯 | 驗證重建（公式 + input） | 與 ScoreCard 已知差異？|
|------|------|---------|------|
| S10 | 累積營收連 3M YoY < −10% | MOPS 月營收 3M | — |
| S11 | 連 2 季稅後 YoY < −5% | MOPS IS 2Q | — |
| S12 | 連 2 季營業利益 YoY < −5% | MOPS IS 2Q | — |
| S13 | YTD 稅後 YoY < −10% | MOPS IS 4Q | — |
| S17 | PB 百分位 > 80%（lookback 期間需與長官確認）| TWSE BWIBBU_d 多日 | — |
| S20 | 單月 YoY 連 2M < 0% | MOPS 月營收 | **是**：標籤寫「單季營收連兩季衰退」、實作是「單月連兩月」（H9）|
| S22 | 收盤 < MA250 且 Alpha250D < −10% | TWSE 250 日 + 自算 | **是**：以 Alpha250D 近似「與大盤比年報酬率」（H8）|

### 5.6 股利聚合（dividend_aggregator.js）

> [dividend_aggregator.js](../../js/lib/dividend_aggregator.js) 把季頻 `現金股利合計 / 股票股利合計` 同年度加總成年度數字，供表格與殖利率／發放率使用。

| UI 標籤 | 公式 | 重建來源 |
|--------|------|---------|
| 年度現金股利 | Σ 同年度各季 `現金股利合計` | MOPS 季股利 |
| 年度股票股利 | Σ 同年度各季 `股票股利合計` | MOPS 季股利 |
| 年度股利合計 | 年度現金股利 + 年度股票股利 | 同上 |

> **驗證流程**：先驗 §4.6 raw（季頻 `現金股利合計`、`股票股利合計`），再驗本表年度加總正確；最後驗 §5.2 的「年度現金殖利率 = 年度現金股利 / 年末收盤」與「年度發放率 = 年度現金股利 / 年度 EPS」。

---

## 六、Tier C — 無法用公開源比對（人工確認清單）

> 這些欄位由本系統自定義，**沒有外部公開源**。請使用者人工確認：(1) 計算公式與商業定義是否符合預期；(2) sample ticker 結果是否合理。

| # | UI 標籤 | 出處 | 計算定義 | sample 2330 結果預期 | 確認重點 |
|---|--------|------|---------|------------------|---------|
| C1 | 規則評分總分 | rule_engine.js → stock_summary.js | 7 條規則加權？平均？需與長官確認權重 | 顯示 8.6 | 評分公式是否與 Python ScoreCard 一致？ |
| C2 | 警示／可評估／資料不足計數 | rule_engine.js | triggered / available / na 三類 | 1 / 7 / 0 | 三類定義邊界 |
| C3 | 估值 key（unknown/loss/low/fair/high/very_high）| stock_summary.js | PE 區間映射 | high (PE 22.7) | 區間切點：10 / 20 / 30 是否合適？金融股需另外處理？|
| C4 | 成長 key | stock_summary.js | salesYoy ± epsYoy 雙條件 | strong | 10% 切點是否該分產業？|
| C5 | 動能 key | stock_summary.js | 3M 報酬區間 | strong | 是否該用權息還原價？ |
| C6 | 配息 key | stock_summary.js | 殖利率區間 | low（0.98%）| 1/3/5 切點是否符合台股實務？|
| C7 | 敘述句連接詞 | stock_summary.js | 估值 key × 成長 key 表 | 「但」 | 全 21 組組合語意是否通順 |
| C8 | 策略類別平均/最高/最低分 | strategy_scores.js | scorecard_web.json strategy_scores × 100 | — | scorecard_web.json 來源與更新頻率 |
| C9 | 策略覆蓋比例 | strategy_scores.js | 有分數策略數 / 總策略數 | — | 「總策略數」如何計 |
| C10 | 策略平均勝率 | strategy.js | strategy_ticker_holding_summary.csv × 100 | — | 勝率計算回測期間／樣本 |
| C11 | 策略平均報酬 | strategy.js | 同上 × 100 | — | 是年化還是累積？除權息？|
| C12 | 策略持有天數 | strategy.js | 同上 | — | 平均持有 vs 中位數 |
| C13 | 規則 S17 PB 百分位 lookback 期間 | rule_engine.js | 程式碼是 2Y 還是 5Y | — | 與長官商業定義對齊 |
| C14 | 規則 S22 中 Alpha250D 切點 | rule_engine.js | < −10% | — | 切點 vs ScoreCard 是否一致 |
| C15 | dottdot `本益比`（UI 標籤「PE」）| md_cm_ta_dailyquotes | 來路不明，2330 為 22.7 對應 EPS ≈ 99.1 | 22.7 | 商業定義為何（forward？內部模型？）；UI 標籤「PE」/「PE₄(預估)」是否需重命名 |

---

## 七、Tier D — 文字／日期屬性（一次性目視抽檢）

| # | UI 標籤 | 抽檢方法 |
|---|--------|---------|
| D1–D6 | 公司名稱 / 英文名稱 / 統一編號 | 抽 6 檔 sample 與 MOPS 字串相等 |
| D7–D12 | 董事長 / 總經理 / 發言人 / 簽證會計師 / 員工人數 | 抽 6 檔與 MOPS 比對 |
| D13–D14 | 上市日期 / 上櫃日期 | 字串相等 |
| D15 | 產業名稱 | 字串相等 |
| D16 | 資料時間（報價／月營收公告／季報公告 3 個 timestamp）| 與 dottdot raw 完全一致 |

---

## 八、執行流程（建議順序）

### 8.1 工具與腳本

新增驗證腳本目錄 `tools/data-verify/`：

```
tools/data-verify/
├── README.md
├── fetch_dottdot.mjs           # 抓 dottdot 同 ticker 各 table 最新 N 筆
├── fetch_twse.mjs              # 抓 TWSE OpenAPI 對應日期的同 ticker
├── fetch_mops.mjs              # 抓 MOPS 對應期別（需處理 form post）
├── fetch_tdcc.mjs              # 抓 TDCC 集保分散
├── compare_tier_a.mjs          # 跑 Tier A 比對，輸出 CSV diff report
├── compare_tier_b.mjs          # 跑 Tier B（含重建公式）
└── reports/                    # 輸出 CSV / md
```

### 8.2 步驟

1. **Step 1**：撰寫 `fetch_*.mjs`，先抓 6 檔 sample × 各 table 最新 N 筆 → 落盤 JSON
2. **Step 2**：跑 `compare_tier_a.mjs`，輸出每欄位「dottdot 值 / 公開源值 / diff / 是否超容差」
3. **Step 3**：跑 `compare_tier_b.mjs`，多一行「前端 transform 重建值」與 UI 顯示值比對
4. **Step 4**：MOPS 部分若無法 API 化（form post + 表格 HTML），改成**人工抓 6 檔 × 1 期 → 貼到 reports/manual-mops.csv**
5. **Step 5**：產出 `reports/2026-05-06-verification-report.md`：
   - Tier A 不一致欄位 → 嚴重級（Critical）
   - Tier B 重建偏差 → 高級（High），定位是上游錯還是前端錯
   - Tier C 列表給長官覆核
   - Tier D 抽檢結果

### 8.3 容差表

| 類別 | 容差 |
|------|-----|
| 報價類（OHLC、收盤）| ±0.01 元 |
| 比率類（漲跌幅、PE/PB、% 持股）| ±0.01% / ±0.1 倍 |
| 財報金額（億／百萬）| ±0.5% 或 ±1 億取大 |
| YoY、CAGR | ±0.5pp |
| 張數（成交量、買賣超）| 0（必須完全一致）|
| 字串（公司名、董事長）| 完全一致；空白不計 |

---

## 九、不一致處理矩陣

| 不一致發生在 | 推論 | 處置 |
|------|------|------|
| Tier A：dottdot raw ≠ 公開源 | dottdot 上游資料錯 | 開 issue 給 dottdot 維護者，附 ticker / 日期 / 期望值 |
| Tier A：dottdot raw = 公開源、UI ≠ raw | 前端 transform 錯 | 修 `js/modules/*` |
| Tier B：raw 對、重建對、UI 錯 | 前端聚合錯 | 修前端 |
| Tier B：raw 對、重建錯、UI = 重建 | 公式定義有歧義 | 文件化定義 + 與長官確認 |
| Tier C：sample 結果不合理 | 自建邏輯有 bug 或定義不清 | 與長官討論商業定義後修 |

---

## 十、受影響檔案

```
docs/plans/2026-05-06-data-correctness-verification.md   （本檔，新增）
tools/data-verify/                                        （新目錄）
  ├── README.md
  ├── fetch_dottdot.mjs
  ├── fetch_twse.mjs
  ├── fetch_mops.mjs
  ├── fetch_tdcc.mjs
  ├── compare_tier_a.mjs
  ├── compare_tier_b.mjs
  └── reports/2026-05-06-verification-report.md
```

**不會動的程式碼**：本計畫只「驗證」，不改前端 / API。發現問題後再開另案修復。

---

## 十一、預估工時

| 階段 | 工時 |
|------|-----:|
| Step 1 fetch_dottdot.mjs | 0.5 hr |
| Step 1 fetch_twse.mjs | 1.0 hr（多個 endpoint）|
| Step 1 fetch_tdcc.mjs | 0.5 hr |
| Step 1 fetch_mops.mjs | 2.0 hr（form post + 表格解析最費工）|
| Step 2 compare_tier_a.mjs | 1.0 hr |
| Step 3 compare_tier_b.mjs（含重建公式）| 2.5 hr |
| Step 4 MOPS 人工補抽 6 檔 × 月營收 / 財報 / 股利 | 1.5 hr |
| Step 5 撰寫驗證報告 | 1.0 hr |
| **合計** | **~10 hr** |

> 若 MOPS 改走「Goodinfo 聚合」抓取（已做表格化），fetch_mops 可省至 0.5 hr，但需考慮 Goodinfo robots.txt 與穩定性。

---

## 十二、風險與緩解

| 風險 | 機率 | 影響 | 緩解 |
|------|-----|-----|------|
| MOPS 表單需 form post + token，自動化困難 | 高 | 中 | 第一輪改人工抽檢 6 檔即可，後續再做自動化 |
| TWSE OpenAPI rate limit | 中 | 低 | sleep 1s/req，6 檔 × 數十 endpoint 應可承受 |
| dottdot API 因日期區間導致回傳空 | 低 | 中 | fetch script 加 retry 與 fallback 較大區間 |
| 技術指標公式（Wilder vs SMA）流派差異 | 中 | 低 | 接受 ±10% 容差，並在報告註明所採流派 |
| 1M/3M 報酬「是否權息還原」尚未定 | 中 | 中 | 比對前先與長官確認，並把兩種版本都試算 |

---

## 十三、驗收條件

- [ ] `tools/data-verify/` 腳本可重複執行，不依賴本機特殊環境（除 `.env` API key）
- [ ] `reports/2026-05-06-verification-report.md` 涵蓋 6 檔 sample 全部 Tier A、B 欄位
- [ ] **所有 Tier A mismatch（不論數量）必須逐項解釋並標記為以下其中之一**，「未解釋 mismatch 為 0」是必要條件：
  - `upstream_error` — dottdot 上游資料錯
  - `endpoint_semantics` — 公開源與 dottdot 為「相似但定義不同」的指標（例：本益比 trailing vs forward）
  - `date_mismatch` — 採樣日期 timezone 邊界或交易日／非交易日差異
  - `frontend_transform_error` — 前端 transform 錯
- [ ] Tier B 重建偏差超容差項目，皆能明確歸類為「上游錯／前端錯／公式定義不清」三類之一，且**每項註明歸類理由**
- [ ] Tier C 共 15 項全列出，含計算定義 + 1 檔 sample 結果，等待長官覆核
- [ ] Tier D 16 項抽檢結果（6 檔 × 抽樣）通過

---

## 十四、未列入本次範圍

- 修復發現的不一致（屬另案）
- 自動化排程跑驗證（屬另案）
- 與 Python ScoreCard 結果做完整對齊（既有 audit 已標記 H8、H9）
- 海外股票 / KY 股 / 興櫃股票（dottdot 範圍外）
- 經濟指標表（`md_cm_eco_economics`，與個股無關）

---

## 十五、附錄：現有相關文件

- `docs/dottdot-stock-data-report.md` — dottdot API 表清單（19 張個股表）
- `docs/dottdot-stock-field-inventory.json` — dottdot 欄位完整字典
- `docs/audit/2026-04-17-api-units-reference.md` — 已驗證的單位映射（沿用）
- `docs/audit/2026-04-17-frontend-audit.md` — 既知前端缺陷（C1–C5、H1–H9）
