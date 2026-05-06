export const DOTTDOT_BASE_URL = "https://data.dottdot.com/api/v1/tables";

export const SAMPLE_TICKERS = Object.freeze([
  "2330",
  "2317",
  "2412",
  "2882",
  "0050",
  "9999",
]);

export const DOTTDOT_DATASETS = Object.freeze([
  {
    key: "quotes",
    table: "md_cm_ta_dailyquotes",
    defaultParams: { page_size: 1500 },
    sections: ["profile", "kline", "stock_summary", "rule_engine"],
  },
  {
    key: "profile",
    table: "bd_cm_companyprofile",
    defaultParams: { page_size: 1 },
    sections: ["profile"],
  },
  {
    key: "sales",
    table: "md_cm_fi_monthsales",
    defaultParams: { page_size: 24 },
    sections: ["revenue", "stock_summary", "rule_engine"],
  },
  {
    key: "income",
    table: "md_cm_fi_is_quarterly",
    defaultParams: { page_size: 14 },
    sections: ["valuation", "profile", "rule_engine"],
  },
  {
    key: "bs",
    table: "md_cm_fi_bs_quarterly",
    defaultParams: { page_size: 8 },
    sections: ["profile", "financial_ratios"],
  },
  {
    key: "dividend",
    table: "md_cm_ot_dividendpolicy",
    defaultParams: { page_size: 40 },
    sections: ["dividend", "stock_summary"],
  },
  {
    key: "foreign",
    table: "md_cm_fd_foreigninsttrading",
    defaultParams: { page_size: 30 },
    sections: ["institutional"],
  },
  {
    key: "trust",
    table: "md_cm_fd_investmenttrusttrading",
    defaultParams: { page_size: 30 },
    sections: ["institutional"],
  },
  {
    key: "broker",
    table: "md_cm_fd_brokertrading",
    defaultParams: { page_size: 30 },
    sections: ["institutional"],
  },
  {
    key: "shareholders",
    table: "md_cm_fd_stockholderstructure",
    defaultParams: { page_size: 12 },
    sections: ["shareholders"],
  },
  {
    key: "cashflow",
    table: "md_cm_fi_cf_quarterly",
    defaultParams: { page_size: 8 },
    sections: ["cashflow", "financial_ratios"],
  },
  {
    key: "stats",
    table: "md_cm_ta_dailystatistics",
    defaultParams: { page_size: 1500 },
    sections: ["risk_technical", "rule_engine"],
  },
  {
    key: "insider",
    table: "md_cm_fd_insiderholdingstructure",
    defaultParams: { page_size: 12 },
    sections: ["insider_governance"],
  },
  {
    key: "annualIs",
    table: "md_cm_fi_is_annual",
    defaultParams: { page_size: 10 },
    sections: ["long_term_trend", "dividend"],
  },
  {
    key: "annualBs",
    table: "md_cm_fi_bs_annual",
    defaultParams: { page_size: 10 },
    sections: ["long_term_trend"],
  },
]);

export const NON_DOTTDOT_SOURCES = Object.freeze([
  {
    key: "scorecard",
    file: "scorecard_web.json",
    sections: ["strategy_scores"],
    tier: "C",
  },
  {
    key: "strategyHoldingSummary",
    file: "strategy_ticker_holding_summary.csv",
    sections: ["strategy"],
    tier: "C",
  },
  {
    key: "strategyTradeSummary",
    file: "strategy_ticker_trade_analysis_summary.csv",
    sections: ["strategy"],
    tier: "C",
  },
]);

export const TIER_C_ITEMS = Object.freeze([
  {
    id: "C1",
    label: "規則評分總分",
    source: "rule_engine.js -> stock_summary.js",
    definition: "Live rule alert derived score; confirm weighting against business definition.",
  },
  {
    id: "C2",
    label: "警示／可評估／資料不足計數",
    source: "rule_engine.js",
    definition: "Counts triggered, available, and N/A rules for the latest period.",
  },
  {
    id: "C3",
    label: "估值 key",
    source: "stock_summary.js",
    definition: "Internal PE bucket mapping.",
  },
  {
    id: "C4",
    label: "成長 key",
    source: "stock_summary.js",
    definition: "Internal sales/EPS growth bucket mapping.",
  },
  {
    id: "C5",
    label: "動能 key",
    source: "stock_summary.js",
    definition: "Internal 3M return bucket mapping.",
  },
  {
    id: "C6",
    label: "配息 key",
    source: "stock_summary.js",
    definition: "Internal dividend-yield bucket mapping.",
  },
  {
    id: "C7",
    label: "敘述句連接詞",
    source: "stock_summary.js",
    definition: "Narrative connector matrix for valuation and growth buckets.",
  },
  {
    id: "C8",
    label: "策略類別平均/最高/最低分",
    source: "strategy_scores.js",
    definition: "scorecard_web.json category aggregates.",
  },
  {
    id: "C9",
    label: "策略覆蓋比例",
    source: "strategy_scores.js",
    definition: "Scored strategies divided by total strategies in the snapshot.",
  },
  {
    id: "C10",
    label: "策略平均勝率",
    source: "strategy.js",
    definition: "Internal backtest holding summary win rate.",
  },
  {
    id: "C11",
    label: "策略平均報酬",
    source: "strategy.js",
    definition: "Internal backtest holding summary return.",
  },
  {
    id: "C12",
    label: "策略持有天數",
    source: "strategy.js",
    definition: "Internal backtest holding duration.",
  },
  {
    id: "C13",
    label: "規則 S17 PB 百分位 lookback 期間",
    source: "rule_engine.js",
    definition: "Internal percentile lookback setting.",
  },
  {
    id: "C14",
    label: "規則 S22 中 Alpha250D 切點",
    source: "rule_engine.js",
    definition: "Internal alpha threshold.",
  },
  {
    id: "C15",
    label: "dottdot 本益比（UI 標籤「PE」）",
    source: "md_cm_ta_dailyquotes",
    definition: "No single public-source equivalent yet; likely forward or internal EPS semantics.",
  },
]);

export const MISMATCH_CLASSIFICATIONS = Object.freeze([
  "upstream_error",
  "endpoint_semantics",
  "date_mismatch",
  "frontend_transform_error",
  "formula_definition_unclear",
  "manual_review_required",
]);

export const TOLERANCES = Object.freeze({
  price: 0.01,
  ratioPercentPoint: 0.01,
  pe: 0.1,
  pb: 0.01,
  moneyEyi: 1,
  yoyPercentPoint: 0.5,
  shares: 0,
});
