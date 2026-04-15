# 加入規則警示、策略買入分數 + 重排版面

## Context（背景）

使用者要求三件事：

1. **將 ScoreCard_V2_New 規則警示整合進網頁**：`daily_run.py` 用 `rule_build.py` 產出一張客戶看的表，目前只被上傳到 Google Sheet，沒呈現在網頁。要把**實際用到的 7 條 sell rules**（S10/S11/S12/S13/S20/S22/S17）顯示在個股基本資訊區塊下方。

2. **重排版面**：K 線圖移到個股基本資訊下方，讓第一屏就是「Profile + K 線」。

3. **顯示策略買入分數**：`/Users/yoga/Desktop/FG_quant_report/data/*_ScoreMatrix_or_Buy.csv`（29 檔策略，約 21 檔於 2026-04-09 更新，其餘停留 2023）— 為每檔股票顯示各策略最新買入分數。

目標：第一屏即可看到 Profile（含警示）+ K 線圖 + 策略分數，決策者掃一眼就有輪廓。

---

## 架構決策

### 挑戰：跨資料源 + 跨目錄
- 規則結果：`ScoreCard_V2_New/Result/Result_Current_Eason篩選表V2_Show.feather`（pyarrow 格式，瀏覽器不能讀）
- 策略分數：29 × 45MB CSV @ `/data/`（全載太大）
- 兩者都在 worktree 範圍外
- Web server 由 `npx serve -l 8081 .` 從 worktree root 服務

### 解法：新增離線匯出腳本
新建 `ScoreCard_V2_New/export_scorecard_to_web.py`，在 `daily_run.py` 跑完之後由使用者手動執行（未來可整合進 daily pipeline）：

1. 讀 `Result_Current_Eason篩選表V2_Show.feather` → 對每支股票取最新一筆，抽出 7 條 sell rules 的 V/– 狀態、警示次數、預估殖利率、分類
2. 讀全部 `data/*_ScoreMatrix_or_Buy.csv` → 對每支股票取各策略最新分數，記錄各策略最新日期（判斷是否 stale）
3. 合併輸出 **單一 compact JSON**：`scorecard_web.json`（預估 < 1MB）
4. **預設輸出路徑（統一規則）**：**與 `index.html` 同層**，用 `Path(__file__).parents[1] / "scorecard_web.json"` 計算
   - 由主 repo 執行 → `StockOnePage/scorecard_web.json`
   - 由 worktree 執行 → `<worktree>/scorecard_web.json`
   - **兩者都與該環境的 `index.html` 同層**，web server 無論從哪啟動都以相對路徑 `scorecard_web.json` 讀到（**單一語義、單一預設**）
   - 需 override 時用 `--output` 或 `SCOREWEB_OUTPUT` env var
5. 把輸出檔加到 `.gitignore`（每日變動、不 commit）

### JSON Schema

```jsonc
{
  "as_of": "2026-04-09",
  "strategies": [
    { "name": "F14_MCTS10", "latest_date": "2026-04-09", "is_stale": false },
    { "name": "F14_MCTS7",  "latest_date": "2023-05-30", "is_stale": true },
    // ... 29 條
  ],
  "rules_meta": [
    { "code": "S10", "name": "累積營收連續三個月YOY衰退10%" },
    { "code": "S11", "name": "連續兩季單季稅後淨利YOY衰退5%" },
    { "code": "S12", "name": "連續兩季單季營業利益YOY衰退5%" },
    { "code": "S13", "name": "今年以來稅後獲利衰退YOY達10%" },
    { "code": "S20", "name": "單季營收連兩季衰退" },
    { "code": "S22", "name": "股票跌破年線且比大盤弱10%" },
    { "code": "S17", "name": "PB百分位大於80%" }
  ],
  "tickers": {
    "2330": {
      "alerts": {
        "close": 2055.0,
        "alert_count": 0,
        "expected_yield": 1.42,
        "category": "景氣循環",
        "triggered_codes": []
      },
      "strategy_scores": {
        "F14_MCTS10": 0.1692,
        "F14_MCTS13": 0.25,
        // ... 出現過該 ticker 的所有策略
      }
    }
    // ... 其他股票
  }
}
```

**設計選擇**：
- 規則是**全域共享（rules_meta）**，每 ticker 只存 `triggered_codes` 陣列（大部分股票的觸發規則很少）→ 節省空間
- 策略是**全域 strategies 陣列** + 每 ticker 的 `strategy_scores` map，stale 判斷放 strategies 層讓所有 ticker 共用

---

## Web 端變更

### Step 1：新增全域資料載入（[js/api.js](../../js/api.js) + [js/main.js](../../js/main.js)）

`api.js` 加一個 fetcher，**用相對路徑**（對齊既有 `strategy.js` 的 CSV 載入慣例）：

```js
export async function fetchScorecard(signal) {
  const res = await fetch("scorecard_web.json", { signal });
  if (!res.ok) return null; // graceful: 404 時返回 null
  return await res.json();
}
```

**為什麼相對路徑**：既有 [js/modules/strategy.js](../../js/modules/strategy.js) 讀 `strategy_ticker_holding_summary.csv` 是相對路徑，保持一致；且子路徑部署時（`/stock/` 之類）root-relative 會 404。

`main.js` 採「**快取優先 + 首次含在 tasks**」模式避免 race：
- 模組級變數 `let scorecardData = null`
- 在 `search(ticker)` 的 `tasks` 陣列**條件式**加入 scorecard fetch：第一次 tasks 包含 scorecard；第二次以後直接用快取
- 所有渲染（含 rule_alerts、strategy_scores）在 Promise.allSettled 之後才執行 → 不會 race、不會出現「資料未就緒」後就不更新的狀況

```js
// main.js 草圖
let scorecardData = null;           // 模組級快取
let scorecardLoadedOnce = false;

async function search(ticker) {
  // ... 現有 tasks ...
  const tasks = [
    // ... 14 個既有 fetcher ...
  ];
  // 首次才加入 scorecard（避免重複下載 500KB+）
  if (!scorecardLoadedOnce) {
    tasks.push({ key: "scorecard", fn: () => fetchScorecard(signal) });
  }
  const results = await Promise.allSettled(tasks.map((t) => t.fn()));
  // ... 解包 ...
  if (!scorecardLoadedOnce) {
    scorecardData = data.scorecard;  // null 或整包 JSON
    scorecardLoadedOnce = true;
  }
  // scorecardData 對所有 render 都是同步可得
  // renderRuleAlerts / renderStrategyScores 吃 scorecardData?.tickers[ticker]
}
```

**好處**：
- 第一次查詢必等 scorecard 到齊才 render → 沒有「閃一下資料未就緒」
- 後續 ticker 切換不重複載入（scorecard 是全域 snapshot）
- 若 scorecard fetch 404，`scorecardData` 是 null，兩個新區塊顯示佔位訊息、但整頁其他 13 個區塊不受影響

### Step 2：[js/modules/rule_alerts.js](../../js/modules/rule_alerts.js) — 新增

**職責**：在 Profile 區塊內（metric cards 下方）注入 7 個規則警示 chip + 警示次數、預估殖利率摘要。

**UI 設計**：
```html
<div class="rule-alerts">
  <div class="rule-alerts-header">
    <span>規則警示 <span class="muted">(景氣循環 · 2026-04-09)</span></span>
    <span>警示 <strong class="val-down">2/7</strong> ｜ 預估殖利率 <strong>4.23%</strong></span>
  </div>
  <div class="rule-chips">
    <!-- 觸發：紅底；未觸發：灰框；hover 顯示完整規則描述 -->
    <span class="chip chip-triggered" title="累積營收連續三個月YOY衰退10%">● S10</span>
    <span class="chip" title="...">○ S11</span>
    <!-- ... 7 chip -->
  </div>
</div>
```

**簽章**：`renderRuleAlerts(tickerData, rulesMeta)` 其中 tickerData = `scorecardData.tickers[ticker]`

**Graceful degradation**：
- 若 `scorecardData` null（JSON 不存在）→ 顯示「規則警示資料未就緒，執行 `export_scorecard_to_web.py` 後重新整理」的提示條- 若該 ticker 不在 tickers map → 顯示「此股票未納入 ScoreCard 追蹤」

### Step 3：[js/modules/strategy_scores.js](../../js/modules/strategy_scores.js) — 新增

**職責**：K 線之後的獨立 full-width 區塊，對當前 ticker 顯示所有策略分數，可排序。

**UI 設計**：
```
策略買入分數（as of 2026-04-09）
┌────────────────────────────────────────────────────────┐
│ 策略 ▲▼ │ 分數 ▲▼ │ 進度條             │ 資料新鮮度 │
├────────────────────────────────────────────────────────┤
│ F14_MCTS10 │ 0.542 │ ████████░░░░░░     │ 最新      │
│ F28_MCTS3  │ 0.421 │ ████████░░░░░░     │ 最新      │
│ F14_MCTS7  │ 0.298 │ █████░░░░░░░░░     │ 過時(2023)│ ← 行加灰
└────────────────────────────────────────────────────────┘
```

- 預設排序：分數由高到低
- Click 欄名切換排序
- 進度條：`width: score × 100%` SVG 或 CSS gradient
- stale 策略整行 `opacity: 0.55 + 淡黃色底色`（不隱藏，讓使用者知道有那個策略）

**簽章**：`renderStrategyScores(tickerData, strategiesMeta)` 其中 tickerData = `scorecardData.tickers[ticker]`

**Graceful**：
- 無 JSON → 顯示占位提示
- ticker 沒有任何策略分數 → 「此股未被任何策略評分」

### Step 3.5：`resetSections()` 擴充（[js/main.js](../../js/main.js) 既有函式）

切 ticker 時必須 reset 新區塊的 skeleton，否則殘留前一檔內容；在既有 `skeletons` map 加入：

```js
const skeletons = {
  // ... 既有 14 條 ...
  "rule-alerts-container":
    '<div class="section-loading"><div class="skeleton h-12 w-full rounded-lg"></div></div>',
  "strategy-scores-container":
    '<div class="section-loading"><div class="skeleton h-48 w-full rounded-lg"></div></div>',
};
```

**注意**：`rule-alerts-container` 是 Profile 區塊內的 sub-div（HTML 新增），不是 full-width section，但仍需獨立 id 供 resetSections 清空。

### Step 4：[index.html](../../index.html) — 重排

**新順序**：

```
Section 1: Profile
  ├── 公司標題 / 收盤價
  ├── 7 metric cards（PE, PB, BV, EPS, 市值, 週轉率, PE4預估）
  └── ⭐ 規則警示 chips（新）
Section 2: K 線圖（移至此處、預設展開）⭐ 移動
Section 3: 策略買入分數（新 full-width 區塊）⭐ 新增
Section 4: 估值趨勢 | 股利
Section 5: 財務比率儀表板
Section 6: 月營收 | 季度損益
Section 7: 現金流 | 5Y 長期趨勢
Section 8: 法人買賣超 | 股權分散
Section 9: 公司治理
Section 10: 風險與技術面
Section 11: 策略績效（既有 CSV）
```

**K 線區段改動**：
- 從 `class="hidden"` 變成預設展開
- 按鈕文字預設 `▼ 收合`（而不是 `▶ 展開`）
- 區段位置物理移到 profile 之後

### Step 5：CSS 微補（[css/style.css](../../css/style.css)）

新增：
- `.rule-alerts` / `.rule-chips` / `.chip` / `.chip-triggered`（chip 圓角、紅底、hover）
- `.strategy-score-row.stale`（灰化樣式）
- `.strategy-score-bar`（進度條 flex + gradient）

### Step 6：.gitignore 與部署備註

- `.gitignore` 新增一行：`scorecard_web.json`
- 在 `export_scorecard_to_web.py` 檔頭 docstring 寫清楚：
  - 使用前先 `pip install pandas pyarrow`
  - 跑 `python export_scorecard_to_web.py`（無參數即可；預設輸出到 `parents[1]/scorecard_web.json`，自動對齊當前所在環境的 `index.html` 同層）
  - Override：`--data-dir` 指 `*_ScoreMatrix_or_Buy.csv` 來源、`--output` 指 JSON 目的地；或設 env `FG_QUANT_ROOT` / `SCOREWEB_OUTPUT`

---

## Python Export Script 細節（[ScoreCard_V2_New/export_scorecard_to_web.py](../../../ScoreCard_V2_New/export_scorecard_to_web.py)）

### 路徑設計原則

**關鍵觀察**：腳本位置永遠是 `<環境>/StockOnePage/ScoreCard_V2_New/export_scorecard_to_web.py`，無論「環境」是主 repo 或 worktree checkout。因此：
- `Path(__file__).parents[1]` → `<環境>/StockOnePage/`，**永遠與 `index.html` 同層** ✅
- `Path(__file__).parents[2]` → 主 repo 時是 `FG_quant_report/`；worktree 時是 `.claude/worktrees/` ❌ 不能用

**預設規則**：

| 參數 | 預設推導 | 可靠度 |
| --- | --- | --- |
| `--output` | `Path(__file__).parents[1] / "scorecard_web.json"` | ✅ 主 repo / worktree 都正確（永遠與 index.html 同層）|
| `--data-dir` | 向上 scan 祖先、找同時有 `data/` + `StockOnePage/` 的目錄 | ⚠️ 需 ancestor scan；worktree 的 `parents[2]` 會錯 |

**Env 覆寫**：
- `FG_QUANT_ROOT`：若設，直接取代 `--data-dir` 探測邏輯
- `SCOREWEB_OUTPUT`：若設，直接取代 `--output` 預設

**使用情境**：

| 情境 | 命令 |
| --- | --- |
| 最常用（無參數）| `python export_scorecard_to_web.py` |
| 指定資料來源 | `python export_scorecard_to_web.py --data-dir /abs/path` |
| 指定輸出位置 | `python export_scorecard_to_web.py --output /abs/path.json` |
| CI / 自動化 | `export FG_QUANT_ROOT=... SCOREWEB_OUTPUT=...` 然後無參數執行 |

**典型 workflow**：
```bash
cd <repo>/StockOnePage/ScoreCard_V2_New   # 主 repo 或 worktree 都行
python daily_run.py                        # 產出 feather
python export_scorecard_to_web.py          # 產出 scorecard_web.json → ../scorecard_web.json
```

### Script 實作（修正後）

```python
#!/usr/bin/env python3
"""
把 daily_run.py 的規則結果 + 29 張 ScoreMatrix_or_Buy.csv 壓成 compact JSON
給 StockOnePage 網頁使用。

預設路徑（env 未設、CLI 未給時）：
  --output    = Path(__file__).parents[1] / "scorecard_web.json"
                  → <環境>/StockOnePage/scorecard_web.json（與 index.html 同層）
                  主 repo 與 worktree 皆正確
  --data-dir  = find_fg_quant_root() / "data"
                  ancestor scan：找同時有 data/ 與 StockOnePage/ 的目錄

Env overrides:
  FG_QUANT_ROOT    取代 data-dir 探測（expected: FG_quant_report/ 根目錄）
  SCOREWEB_OUTPUT  取代 --output 預設

Usage:
  cd <repo>/StockOnePage/ScoreCard_V2_New          # 主 repo 或 worktree 都行
  python export_scorecard_to_web.py                # 無參數、預設即正確
  python export_scorecard_to_web.py --data-dir /abs --output /abs.json  # override
"""
import argparse, glob, json, os, sys
from pathlib import Path
import pandas as pd

SELL_RULES = [
    ("S10", "累積營收連續三個月YOY衰退10%"),
    ("S11", "連續兩季單季稅後淨利YOY衰退5%"),
    ("S12", "連續兩季單季營業利益YOY衰退5%"),
    ("S13", "今年以來稅後獲利衰退YOY達10%"),
    ("S20", "單季營收連兩季衰退"),
    ("S22", "股票跌破年線且比大盤弱10%"),
    ("S17", "PB百分位大於80%"),
]

def find_fg_quant_root():
    """從 env 或向上 scan 找同時含 data/ 和 StockOnePage/ 的祖先。找不到明確報錯。"""
    envroot = os.environ.get("FG_QUANT_ROOT")
    if envroot:
        p = Path(envroot).resolve()
        if (p / "data").is_dir() and (p / "StockOnePage").is_dir():
            return p
        sys.exit(f"ERROR: FG_QUANT_ROOT={envroot} 下找不到同時含 data/ 與 StockOnePage/")
    # 由腳本位置和 CWD 兩路向上掃描
    for start in [Path(__file__).resolve(), Path.cwd().resolve()]:
        for ancestor in [start, *start.parents][:8]:
            if (ancestor / "data").is_dir() and (ancestor / "StockOnePage").is_dir():
                return ancestor
    sys.exit("ERROR: 無法自動偵測 FG_QUANT_ROOT；請 export FG_QUANT_ROOT 或用 --data-dir 指定。")

def load_alerts(scorecard_dir):
    feather_path = scorecard_dir / "Result" / "Result_Current_Eason篩選表V2_Show.feather"
    if not feather_path.exists():
        sys.exit(f"ERROR: feather 不存在: {feather_path}（先跑 daily_run.py）")
    df = pd.read_feather(feather_path)
    latest = df.loc[df.groupby("標的代號")["日期"].idxmax()].copy()
    alerts = {}
    for _, row in latest.iterrows():
        tk = str(row["標的代號"])
        triggered = []
        for code, name in SELL_RULES:
            if name in df.columns and row[name] == "V":
                triggered.append(code)
        alerts[tk] = {
            "close": float(row["收盤價"]) if pd.notna(row["收盤價"]) else None,
            "alert_count": int(row.get("警示次數") if pd.notna(row.get("警示次數")) else row.get("分數", 0) or 0),
            "expected_yield": float(row["預估殖利率_財報推估(%)"]) if pd.notna(row.get("預估殖利率_財報推估(%)")) else None,
            "category": row.get("分類"),
            "triggered_codes": triggered,
        }
    return alerts, str(latest["日期"].max())

def load_strategy_scores(data_dir):
    scores = {}
    strategies_meta = []
    files = sorted(glob.glob(f"{data_dir}/*_ScoreMatrix_or_Buy.csv"))
    if not files:
        sys.exit(f"ERROR: {data_dir} 找不到任何 *_ScoreMatrix_or_Buy.csv")
    STALE_THRESHOLD = "2025-01-01"
    for fp in files:
        name = os.path.basename(fp).replace("_ScoreMatrix_or_Buy.csv", "")
        df = pd.read_csv(fp)
        last = df.iloc[-1]
        latest_date = str(last["Date"])[:10]
        strategies_meta.append({
            "name": name,
            "latest_date": latest_date,
            "is_stale": latest_date < STALE_THRESHOLD,
        })
        for col in df.columns[2:]:
            tk = str(col)
            val = last[col]
            if pd.notna(val):
                scores.setdefault(tk, {})[name] = round(float(val), 4)
    return scores, strategies_meta

def main():
    scorecard_dir = Path(__file__).resolve().parent  # <env>/StockOnePage/ScoreCard_V2_New/
    stockonepage_dir = scorecard_dir.parent          # <env>/StockOnePage/ — 與 index.html 同層

    # --output 預設：永遠與 index.html 同層（主 repo 或 worktree 自動對齊）
    # --data-dir 預設：需 ancestor scan
    default_output = os.environ.get("SCOREWEB_OUTPUT") or str(stockonepage_dir / "scorecard_web.json")
    default_data_dir = str(find_fg_quant_root() / "data")

    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=default_data_dir)
    ap.add_argument("--output", default=default_output)
    args = ap.parse_args()

    print(f"output   = {args.output}")
    print(f"data-dir = {args.data_dir}")

    alerts, as_of = load_alerts(scorecard_dir)
    scores, strategies = load_strategy_scores(args.data_dir)

    all_tickers = set(alerts.keys()) | set(scores.keys())
    tickers_out = {}
    for tk in all_tickers:
        tickers_out[tk] = {
            "alerts": alerts.get(tk),
            "strategy_scores": scores.get(tk, {}),
        }

    out = {
        "as_of": as_of,
        "strategies": strategies,
        "rules_meta": [{"code": c, "name": n} for c, n in SELL_RULES],
        "tickers": tickers_out,
    }
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"\n✓ Wrote {args.output}")
    print(f"  {len(tickers_out)} tickers, {len(strategies)} strategies, as_of={as_of}")

if __name__ == "__main__":
    main()
```

**設計要點**：
- `--output` 預設靠 `Path(__file__).parents[1]`，穩定對齊主 repo / worktree 的 `index.html` 同層
- `--data-dir` 預設靠 ancestor scan（因為 `parents[2]` 在 worktree 會偏）
- 錯誤路徑 / 缺檔案 → 立刻 `sys.exit` 帶明確訊息（不靜默產生空 JSON）
- `FG_QUANT_ROOT` / `SCOREWEB_OUTPUT` env 提供給 CI / 自動化無參數執行使用

---

## 實作順序

1. **Python script first**（離線產出 JSON）— 可立即在 CLI 驗證輸出格式
2. **`.gitignore` 加 `scorecard_web.json`**
3. **Generate 一份 JSON 到 worktree** — 供 web 開發測試
4. **`js/api.js` 加 fetcher + `js/main.js` 整合全域載入**
5. **`js/modules/rule_alerts.js` + profile 區塊整合**（dispatch 新 module）
6. **`index.html` 重排**：K 線移上、移預設展開、新增策略分數 section 容器
7. **`js/modules/strategy_scores.js`** — sortable 表
8. **CSS 補**`style.css`
9. **Preview 驗證** — 2330 / 2412 / 2886

---

## Fallback 與錯誤行為

| 情境 | 行為 |
| --- | --- |
| JSON 檔不存在（首次開發 / production 未部署）| 顯示佔位條：「執行 export_scorecard_to_web.py 後重新整理」 |
| ticker 不在 JSON tickers map | 規則警示顯示「此股未納入 ScoreCard 追蹤」、策略分數顯示「此股未被任何策略評分」 |
| ticker 只有 alerts、沒有策略分數 | 兩個區塊獨立，互不影響（分開檢查）|
| 某策略該 ticker 無分數 | 該列不出現（只顯示有分數的策略）|

---

## Critical files

**需修改：**
- [index.html](../../index.html) — section 重排、K 線預設展開、加策略分數 section
- [js/api.js](../../js/api.js) — 加 `fetchScorecard`
- [js/main.js](../../js/main.js) — 全域載入 JSON、新 2 個 render dispatch
- [css/style.css](../../css/style.css) — rule chips、strategy score row、stale row
- `.gitignore` — 新增 `scorecard_web.json`

**新增：**
- `js/modules/rule_alerts.js`
- `js/modules/strategy_scores.js`
- `ScoreCard_V2_New/export_scorecard_to_web.py`

**不修改：**
- `daily_run.py` / `rule_build.py`（維持現狀；export script 是獨立副作用）
- 既有 14 個 module（本改動只做「新增 + 版面」）

---

## Verification（驗收）

### Python 端

假設從 `ScoreCard_V2_New/` 執行；匯出的 JSON 落在 `../scorecard_web.json`（= `<環境>/StockOnePage/scorecard_web.json`，與 `index.html` 同層）。

```bash
cd <env>/StockOnePage/ScoreCard_V2_New
pip install pandas pyarrow                      # 首次
python export_scorecard_to_web.py               # 輸出到 ../scorecard_web.json
```

1. 檢查輸出檔 size（期望 200KB-1MB）：`ls -lh ../scorecard_web.json`
2. Schema 快檢：
   ```bash
   python -c "import json; d=json.load(open('../scorecard_web.json')); print(len(d['tickers']), len(d['strategies']), d['as_of'])"
   ```
3. 抽樣檢查 2330：
   ```bash
   python -c "import json; d=json.load(open('../scorecard_web.json')); print(d['tickers']['2330'])"
   ```
   預期：`alerts.close` ≈ 最新收盤、`strategy_scores` 有 ≥ 10 筆
4. **若從其他目錄跑驗收**：把 `../scorecard_web.json` 改為對應路徑，或 `cd <env>/StockOnePage` 後用 `scorecard_web.json`

### Web 端
1. `preview_start("dev")` → 載入首頁
2. **視覺檢查**：
   - Profile 下方出現 7 個 chip（2330 的觸發情況預期 0/7 — 台積電營收動能強，應無警示）
   - K 線圖**預設展開**、位置緊接 Profile
   - 策略分數表位於 K 線後、估值前、預設按分數排序
3. **互動檢查**：
   - Click 策略表的 欄名 → 切換排序
   - hover chip → 顯示完整規則描述
   - 切 2330 → 2412 → 2886，三個區塊都更新
4. **邊緣測試**：暫時 rename 掉 scorecard_web.json → 重新整理，期望兩個新區塊顯示佔位訊息而非白屏或 console error
5. **響應式**：手機 375px 下 chip 自動換行、策略表有橫向捲軸
6. **Regression**：既有 14 個區塊全部渲染正常、K 線圖 range 切換仍可用

### DevTools
- Console 零錯誤
- Network：`scorecard_web.json` 一次載入 200、size < 1MB（首次後走快取）

---

## 邊界備註

- **部署時 JSON 位置**：預設 `parents[1]/scorecard_web.json`（= `<環境>/StockOnePage/scorecard_web.json`）對主 repo 與 worktree 都是正確的「與 index.html 同層」，單一語義。若生產環境 web server 從別的目錄啟動，用 `SCOREWEB_OUTPUT` 環境變數或 `--output` 覆寫即可
- **stale 策略門檻**：`2025-01-01` 為硬編碼。實際使用上可改為「最新日期比最新日差超過 180 天算 stale」— 可列為 next-iteration
- **Python 依賴**：daily_run.py 已依賴 pandas+pyarrow；export script 多不出額外依賴
- **效能**：29 × 45MB CSV 讀取 + pivot 預計數十秒，可接受（每日一次的離線任務）
