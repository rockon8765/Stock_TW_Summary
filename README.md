# StockOnePage

台股個股資料一頁式查詢工具，輸入股票代號即可快速瀏覽完整的基本面、技術面與籌碼面資訊。

## Demo

GitHub Pages: [https://rockon8765.github.io/Stock_TW_Summary/](https://rockon8765.github.io/Stock_TW_Summary/)

## 功能

- **公司概要** — 基本資訊一覽
- **K 線圖** — 支援 3M / 6M / 1Y / 3Y / 5Y 區間切換（Lightweight Charts v4）
- **月營收** — 近 12 個月營收圖表與數據表
- **季度損益** — 近 8 季損益摘要
- **三大法人買賣超** — 近 30 日外資、投信、自營商買賣超走勢
- **股權分散表** — 持股級距分布與大戶持股趨勢（近 12 週）

## 技術

- 純前端靜態網頁，無需後端
- Tailwind CSS — 深色主題 UI
- [Lightweight Charts v4](https://github.com/tradingview/lightweight-charts) — K 線圖
- [Chart.js](https://www.chartjs.org/) — 營收、法人、股權圖表
- 資料來源：CMWebAPI（`data.dottdot.com`）

## 專案結構

```
├── index.html          # 主頁面
├── css/style.css       # 自訂樣式
└── js/
    ├── main.js         # 進入點與事件綁定
    ├── api.js          # API 請求封裝
    ├── utils.js        # 共用工具函式
    ├── charts/         # 圖表繪製
    │   ├── kline.js
    │   └── chip.js
    └── modules/        # 各區塊資料載入
        ├── profile.js
        ├── revenue.js
        ├── income.js
        ├── institutional.js
        └── shareholders.js
```

## 使用方式

靜態網頁，直接開啟 `index.html` 或部署至任意靜態託管服務即可。

```bash
# 本地開發（任選一種）
python -m http.server 8000
# 或
npx serve .
```

策略績效摘要檔預設會從 `js/config.js` 的 `APP_CONFIG.strategyDataBaseUrl` 指定位置讀取；目前預設為 `./`，也就是直接讀取 repo 根目錄的 `strategy_ticker_holding_summary.csv` 與 `strategy_ticker_trade_analysis_summary.csv`。更新資料時，請先重新產生 summary，再同步到 `StockOnePage` repo 根目錄後部署。

## License

MIT
