import { DOTTDOT_BASE_URL } from "./contract.mjs";
import { toNumber } from "./compare.mjs";

export function buildDottdotQueryUrl(
  tableName,
  { apiKey = process.env.DOTTDOT_API_KEY || "guest", params = {} } = {},
) {
  const url = new URL(`${DOTTDOT_BASE_URL}/${tableName}/query`);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(key, value);
  }
  return url;
}

export function buildTwseStockDayUrl(ticker, date) {
  const compactDate = String(date).replaceAll("-", "").slice(0, 8);
  const url = new URL("https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY");
  url.searchParams.set("date", compactDate);
  url.searchParams.set("stockNo", ticker);
  url.searchParams.set("response", "json");
  return url;
}

export function buildTwseStockDayAllUrl() {
  return new URL("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL");
}

export function buildTwseBwibbuUrl() {
  return new URL("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_d");
}

export function buildTwseT86Url(date, selectType = "ALLBUT0999") {
  const compactDate = String(date).replaceAll("-", "").slice(0, 8);
  const url = new URL("https://www.twse.com.tw/rwd/zh/fund/T86");
  url.searchParams.set("date", compactDate);
  url.searchParams.set("selectType", selectType);
  url.searchParams.set("response", "json");
  return url;
}

export function buildTwseMonthlySalesUrl() {
  return new URL("https://openapi.twse.com.tw/v1/opendata/t187ap05_L");
}

export function buildTwseCompanyListUrl() {
  return new URL("https://openapi.twse.com.tw/v1/opendata/t187ap03_L");
}

export async function fetchJson(url, { fetchImpl = fetch, signal } = {}) {
  const response = await fetchImpl(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

export async function fetchDottdotTable(
  tableName,
  { ticker, params = {}, apiKey, fetchImpl = fetch, signal } = {},
) {
  const url = buildDottdotQueryUrl(tableName, {
    apiKey,
    params: { ticker, ...params },
  });
  const json = await fetchJson(url, { fetchImpl, signal });
  if (json.status !== "success") {
    throw new Error(json.message || `dottdot query failed: ${tableName}`);
  }
  return json;
}

export async function fetchTwseStockDay(
  ticker,
  date,
  { fetchImpl = fetch, signal } = {},
) {
  return fetchJson(buildTwseStockDayUrl(ticker, date), { fetchImpl, signal });
}

export async function fetchTwseBwibbu({ fetchImpl = fetch, signal } = {}) {
  return fetchJson(buildTwseBwibbuUrl(), { fetchImpl, signal });
}

export async function fetchTwseMonthlySales({ fetchImpl = fetch, signal } = {}) {
  return fetchJson(buildTwseMonthlySalesUrl(), { fetchImpl, signal });
}

export async function fetchTwseCompanyList({ fetchImpl = fetch, signal } = {}) {
  return fetchJson(buildTwseCompanyListUrl(), { fetchImpl, signal });
}

export async function fetchTwseT86(date, { fetchImpl = fetch, signal } = {}) {
  return fetchJson(buildTwseT86Url(date), { fetchImpl, signal });
}

export function findTwseMonthlySalesRow(payload, ticker) {
  const rows = Array.isArray(payload) ? payload : payload?.data ?? [];
  return rows.find((row) => String(row?.["公司代號"]) === String(ticker)) ?? null;
}

export function findTwseCompanyRow(payload, ticker) {
  const rows = Array.isArray(payload) ? payload : payload?.data ?? [];
  return rows.find((row) => String(row?.["公司代號"]) === String(ticker)) ?? null;
}

export function findTwseT86Row(payload, ticker) {
  const rows = payload?.data ?? [];
  return rows.find((row) => Array.isArray(row) && String(row[0]).trim() === String(ticker)) ?? null;
}

export function parseRocDate(value) {
  if (!value) return "";
  const parts = String(value).trim().split("/");
  if (parts.length !== 3) return String(value);
  const [rocYear, month, day] = parts;
  const year = Number(rocYear) + 1911;
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

export function normalizeTwseStockDayRow(row) {
  if (!Array.isArray(row)) return null;
  return {
    date: parseRocDate(row[0]),
    tradeVolume: toNumber(row[1]),
    tradeValue: toNumber(row[2]),
    open: toNumber(row[3]),
    high: toNumber(row[4]),
    low: toNumber(row[5]),
    close: toNumber(row[6]),
    change: toNumber(row[7]),
    transactions: toNumber(row[8]),
  };
}

export function normalizeTwseStockDayPayload(payload) {
  return (payload?.data ?? [])
    .map((row) => normalizeTwseStockDayRow(row))
    .filter(Boolean);
}

export function normalizeBwibbuRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    code: row.Code ?? row["證券代號"] ?? row["股票代號"],
    name: row.Name ?? row["證券名稱"] ?? row["股票名稱"],
    dividendYield: toNumber(row.DividendYield ?? row["殖利率(%)"]),
    pe: toNumber(row.PEratio ?? row["本益比"]),
    pb: toNumber(row.PBratio ?? row["股價淨值比"]),
    fiscalYearQuarter: row.FiscalYearQuarter ?? row["財報年/季"],
  };
}

export function normalizeBwibbuPayload(payload) {
  return (Array.isArray(payload) ? payload : payload?.data ?? [])
    .map((row) => normalizeBwibbuRow(row))
    .filter(Boolean);
}
