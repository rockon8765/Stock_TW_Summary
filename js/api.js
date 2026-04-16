const BASE_URL = "https://data.dottdot.com/api/v1/tables";
const API_KEY = "guest";

export async function queryTable(tableName, params = {}, signal) {
  const url = new URL(`${BASE_URL}/${tableName}/query`);
  url.searchParams.set("api_key", API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const json = await res.json();
  if (json.status !== "success") throw new Error(json.message || "API Error");
  return json;
}

function fiveYearsAgo() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function fetchDailyQuotes(ticker, signal) {
  return queryTable(
    "md_cm_ta_dailyquotes",
    {
      ticker,
      start: fiveYearsAgo(),
      end: today(),
      page_size: 1500,
    },
    signal,
  );
}

export function fetchCompanyProfile(ticker, signal) {
  return queryTable(
    "bd_cm_companyprofile",
    {
      ticker,
      page_size: 1,
    },
    signal,
  );
}

export function fetchMonthSales(ticker, signal) {
  return queryTable(
    "md_cm_fi_monthsales",
    {
      ticker,
      page_size: 12,
    },
    signal,
  );
}

export function fetchQuarterlyIncome(ticker, signal) {
  return queryTable(
    "md_cm_fi_is_quarterly",
    {
      ticker,
      page_size: 8,
    },
    signal,
  );
}

export function fetchForeignTrading(ticker, signal) {
  return queryTable(
    "md_cm_fd_foreigninsttrading",
    {
      ticker,
      page_size: 30,
    },
    signal,
  );
}

export function fetchTrustTrading(ticker, signal) {
  return queryTable(
    "md_cm_fd_investmenttrusttrading",
    {
      ticker,
      page_size: 30,
    },
    signal,
  );
}

export function fetchBrokerTrading(ticker, signal) {
  return queryTable(
    "md_cm_fd_brokertrading",
    {
      ticker,
      page_size: 30,
    },
    signal,
  );
}

export function fetchShareholderStructure(ticker, signal) {
  return queryTable(
    "md_cm_fd_stockholderstructure",
    {
      ticker,
      page_size: 12,
    },
    signal,
  );
}

// page_size: 40（約 10 年季資料）— 原 10 筆 ≈ 2.5 年，
// 與 index.html「近 10 年」標題不符；聚合器會把季→年彙總。
export function fetchDividendPolicy(ticker, signal) {
  return queryTable(
    "md_cm_ot_dividendpolicy",
    {
      ticker,
      page_size: 40,
    },
    signal,
  );
}

// === 新增：Tier 1 + Tier 2 所需 fetchers ===

// 季度現金流量（8Q）— 用於現金流摘要與財務比率 FCF 覆蓋率
export function fetchQuarterlyCashflow(ticker, signal) {
  return queryTable(
    "md_cm_fi_cf_quarterly",
    {
      ticker,
      page_size: 8,
    },
    signal,
  );
}

// 每日技術統計（5Y 日頻）— 用於風險與技術面區塊；module 自行挑月末值
export function fetchDailyStatistics(ticker, signal) {
  return queryTable(
    "md_cm_ta_dailystatistics",
    {
      ticker,
      start: fiveYearsAgo(),
      end: today(),
      page_size: 1500,
    },
    signal,
  );
}

// 內部人持股結構（近 12 個月）— 用於公司治理區塊
export function fetchInsiderStructure(ticker, signal) {
  return queryTable(
    "md_cm_fd_insiderholdingstructure",
    {
      ticker,
      page_size: 12,
    },
    signal,
  );
}

// 年度損益表（page_size: 10 覆蓋 10 年）
// 用途：(1) dividend.js 歷史發放率；(2) long_term_trend 5Y CAGR + ROE/ROA 年度趨勢
export function fetchAnnualIncome(ticker, signal) {
  return queryTable(
    "md_cm_fi_is_annual",
    {
      ticker,
      page_size: 10,
    },
    signal,
  );
}

// 年度資產負債表（page_size: 10 對齊 fetchAnnualIncome）
export function fetchAnnualBS(ticker, signal) {
  return queryTable(
    "md_cm_fi_bs_annual",
    {
      ticker,
      page_size: 10,
    },
    signal,
  );
}

export function fetchQuarterlyBS(ticker, signal) {
  return queryTable(
    "md_cm_fi_bs_quarterly",
    {
      ticker,
      page_size: 8,
    },
    signal,
  );
}

// === 全域策略分數 snapshot ===
// 由 ScoreCard_V2_New/export_scorecard_to_web.py 產生並隨 repo 一起部署。
// 規則警示不讀這個檔案，只供策略分數區塊使用。
export async function fetchStrategySnapshot(signal) {
  try {
    const res = await fetch("scorecard_web.json", { signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") throw err;
    return null;
  }
}
