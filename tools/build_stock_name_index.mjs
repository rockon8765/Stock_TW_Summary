#!/usr/bin/env node
import { writeJsonFile } from "./data-verify/lib/report_io.mjs";
import { buildDottdotQueryUrl, fetchJson } from "./data-verify/lib/fetchers.mjs";

const TABLE_NAME = "bd_cm_companyprofile";
const DEFAULT_OUTPUT = "stock_name_index.json";
const DEFAULT_PAGE_SIZE = 5000;

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text && !["nan", "null", "undefined"].includes(text.toLowerCase())
    ? text
    : "";
}

function addAlias(record, value) {
  const alias = normalizeText(value);
  if (alias) record.names.add(alias);
}

function buildIndex(rows) {
  const latestByTicker = new Map();

  for (const row of rows) {
    const ticker = normalizeText(row?.["股票代號"]);
    if (!/^\d{4,6}[A-Z]?$/.test(ticker)) continue;

    const year = Number(row?.["年度"] ?? 0);
    const existing = latestByTicker.get(ticker);
    if (!existing || year > existing.year) {
      latestByTicker.set(ticker, { ticker, year, names: new Set() });
    }

    const record = latestByTicker.get(ticker);
    if (year !== record.year) continue;
    addAlias(record, row?.["股票名稱"]);
    addAlias(record, row?.["中文簡稱"]);
    addAlias(record, row?.["公司名稱"]);
  }

  return [...latestByTicker.values()]
    .filter((record) => record.names.size > 0)
    .sort((left, right) => left.ticker.localeCompare(right.ticker, "en"))
    .map((record) => ({
      ticker: record.ticker,
      names: [...record.names],
    }));
}

async function fetchAllCompanyProfiles({ apiKey, pageSize }) {
  const rows = [];
  let totalCount = Infinity;

  for (let page = 1; rows.length < totalCount; page += 1) {
    const url = buildDottdotQueryUrl(TABLE_NAME, {
      apiKey,
      params: { page, page_size: pageSize },
    });
    const json = await fetchJson(url);
    if (json.status !== "success") {
      throw new Error(json.message || `dottdot query failed: ${TABLE_NAME}`);
    }

    const pageRows = Array.isArray(json.data) ? json.data : [];
    rows.push(...pageRows);
    totalCount = Number(json.total_count ?? rows.length);
    if (pageRows.length === 0) break;
  }

  return rows;
}

export async function buildStockNameIndex({
  apiKey = process.env.DOTTDOT_API_KEY || process.env.CM_API_KEY || "guest",
  output = DEFAULT_OUTPUT,
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) {
  const rows = await fetchAllCompanyProfiles({ apiKey, pageSize });
  const index = buildIndex(rows);
  await writeJsonFile(output, index);
  return { output, rows: rows.length, entries: index.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs();
  buildStockNameIndex({
    apiKey: args.apiKey || process.env.DOTTDOT_API_KEY || process.env.CM_API_KEY || "guest",
    output: args.out || DEFAULT_OUTPUT,
    pageSize: args.pageSize ? Number(args.pageSize) : DEFAULT_PAGE_SIZE,
  })
    .then(({ output, rows, entries }) => {
      console.log(`Wrote ${output} (${entries} entries from ${rows} rows)`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
