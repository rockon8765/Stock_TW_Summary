#!/usr/bin/env python3
"""
把 daily_run.py 的規則結果 + 29 張 ScoreMatrix_or_Buy.csv 壓成 compact JSON
給 StockOnePage 網頁使用。

這個檔案的輸出 `scorecard_web.json` 是靜態部署資產：
- 產生後要和前端程式碼一起提交
- 每次策略矩陣或 ScoreCard 資料更新後，都要重新 export 並同步新檔案
- 前端目前只把它當成策略分數 snapshot，規則警示仍以 Live API 即時計算

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
import argparse
import glob
import json
import os
import sys
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

STALE_THRESHOLD = "2025-01-01"  # 2024 年以前之策略 snapshot 算 stale


def find_fg_quant_root() -> Path:
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
    sys.exit(
        "ERROR: 無法自動偵測 FG_QUANT_ROOT；請 export FG_QUANT_ROOT 或用 --data-dir 指定。"
    )


def load_alerts(scorecard_dir: Path):
    """讀 Result_Current_Eason篩選表V2_Show.feather 取每支股票最新一筆。"""
    feather_path = (
        scorecard_dir / "Result" / "Result_Current_Eason篩選表V2_Show.feather"
    )
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

        # 警示次數可能在 `警示次數` 或 `分數`（視產生流程而定）
        count = row.get("警示次數") if "警示次數" in df.columns else row.get("分數")
        try:
            count_int = int(count) if pd.notna(count) else 0
        except (TypeError, ValueError):
            count_int = 0

        yield_val = None
        if "預估殖利率_財報推估(%)" in df.columns:
            y = row.get("預估殖利率_財報推估(%)")
            if pd.notna(y):
                try:
                    yield_val = float(y)
                except (TypeError, ValueError):
                    yield_val = None

        close_val = None
        if "收盤價" in df.columns:
            c = row.get("收盤價")
            if pd.notna(c):
                try:
                    close_val = float(c)
                except (TypeError, ValueError):
                    close_val = None

        category = None
        if "分類" in df.columns:
            cat = row.get("分類")
            if pd.notna(cat):
                category = str(cat)

        alerts[tk] = {
            "close": close_val,
            "alert_count": count_int,
            "expected_yield": yield_val,
            "category": category,
            "triggered_codes": triggered,
        }

    latest_date = str(latest["日期"].max())[:10]
    return alerts, latest_date


def load_strategy_scores(data_dir: str):
    """讀 *_ScoreMatrix_or_Buy.csv，聚合為 {ticker: {strategy: score}}。"""
    scores = {}
    strategies_meta = []
    files = sorted(glob.glob(f"{data_dir}/*_ScoreMatrix_or_Buy.csv"))
    # 排除 _OLD 檔
    files = [f for f in files if "_OLD" not in os.path.basename(f)]
    if not files:
        sys.exit(f"ERROR: {data_dir} 找不到任何 *_ScoreMatrix_or_Buy.csv")

    for fp in files:
        name = os.path.basename(fp).replace("_ScoreMatrix_or_Buy.csv", "")
        df = pd.read_csv(fp)
        if len(df) == 0 or "Date" not in df.columns:
            continue
        last = df.iloc[-1]
        latest_date = str(last["Date"])[:10]
        strategies_meta.append(
            {
                "name": name,
                "latest_date": latest_date,
                "is_stale": latest_date < STALE_THRESHOLD,
            }
        )
        for col in df.columns[2:]:  # 跳過 index, Date
            tk = str(col)
            val = last[col]
            if pd.notna(val):
                try:
                    scores.setdefault(tk, {})[name] = round(float(val), 4)
                except (TypeError, ValueError):
                    continue

    return scores, strategies_meta


def main():
    scorecard_dir = Path(__file__).resolve().parent  # <env>/StockOnePage/ScoreCard_V2_New/
    stockonepage_dir = scorecard_dir.parent  # <env>/StockOnePage/ — 與 index.html 同層

    # --output 預設：永遠與 index.html 同層（主 repo 或 worktree 自動對齊）
    default_output = os.environ.get("SCOREWEB_OUTPUT") or str(
        stockonepage_dir / "scorecard_web.json"
    )
    # --data-dir 預設：ancestor scan
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
    print(
        f"  {len(tickers_out)} tickers, {len(strategies)} strategies, as_of={as_of}"
    )


if __name__ == "__main__":
    main()
