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

export function fetchDividendPolicy(ticker, signal) {
  return queryTable(
    "md_cm_ot_dividendpolicy",
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
