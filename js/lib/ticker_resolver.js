import { ensureStrategyDataLoaded } from "../modules/strategy.js";

const STOCK_NAME_INDEX_URL = "./stock_name_index.json";

let cachedStockNameIndex = null;
let cachedStrategyIndex = null;

function createIndex() {
  return { names: new Map() };
}

function normalizeName(value) {
  const name = String(value ?? "").trim();
  return name && !["nan", "null", "undefined"].includes(name.toLowerCase())
    ? name
    : "";
}

function addName(index, name, code) {
  const normalizedName = normalizeName(name);
  const normalizedCode = String(code ?? "").trim();
  if (!normalizedName || !normalizedCode) return;
  const codes = index.names.get(normalizedName) ?? new Set();
  codes.add(normalizedCode);
  index.names.set(normalizedName, codes);
}

function buildIndexFromStockNameIndex(rows) {
  const index = createIndex();
  for (const row of rows ?? []) {
    const code = String(row?.ticker ?? row?.["股票代號"] ?? "").trim();
    for (const name of row?.names ?? []) addName(index, name, code);
  }
  return index;
}

function buildIndexFromHolding(holdingData) {
  const index = createIndex();
  for (const row of holdingData ?? []) {
    addName(index, row?.["股票名稱"], row?.["股票代號"]);
  }
  return index;
}

function lookupIndex(index, text) {
  if (!index) return { status: "miss", ticker: null };
  if (index.names.has(text)) {
    const codes = index.names.get(text);
    return codes.size === 1
      ? { status: "hit", ticker: [...codes][0] }
      : { status: "ambiguous", ticker: null };
  }

  const matches = new Set();
  for (const [name, codes] of index.names.entries()) {
    if (!name.includes(text)) continue;
    for (const code of codes) matches.add(code);
  }

  if (matches.size === 0) return { status: "miss", ticker: null };
  if (matches.size === 1) return { status: "hit", ticker: [...matches][0] };
  return { status: "ambiguous", ticker: null };
}

async function fetchStockNameIndex(fetchImpl = fetch) {
  const response = await fetchImpl(STOCK_NAME_INDEX_URL);
  if (!response.ok) throw new Error("stock name index fetch failed");
  return response.json();
}

async function getStockNameIndex(loadNameIndex) {
  if (cachedStockNameIndex) return cachedStockNameIndex;

  try {
    const rows = await loadNameIndex();
    if (!Array.isArray(rows)) return null;
    cachedStockNameIndex = buildIndexFromStockNameIndex(rows);
    return cachedStockNameIndex;
  } catch {
    return null;
  }
}

async function getStrategyIndex(ensureLoad) {
  if (cachedStrategyIndex) return cachedStrategyIndex;

  const state = await ensureLoad();
  if (state?.status !== "loaded") return null;
  cachedStrategyIndex = buildIndexFromHolding(state.holdingData ?? []);
  return cachedStrategyIndex;
}

export function resetTickerResolverForTests() {
  cachedStockNameIndex = null;
  cachedStrategyIndex = null;
}

export async function resolveTickerInput(input, deps = {}) {
  const ensureLoad = deps.ensureLoad ?? ensureStrategyDataLoaded;
  const loadNameIndex =
    deps.loadNameIndex ?? (() => fetchStockNameIndex(deps.fetchImpl));
  const text = String(input ?? "").trim();
  if (!text) return null;
  if (/^\d{4,6}[A-Z]?$/.test(text)) return text;

  const stockNameResult = lookupIndex(
    await getStockNameIndex(loadNameIndex),
    text,
  );
  if (stockNameResult.status === "hit") return stockNameResult.ticker;
  if (stockNameResult.status === "ambiguous") return null;

  const strategyResult = lookupIndex(await getStrategyIndex(ensureLoad), text);
  return strategyResult.status === "hit" ? strategyResult.ticker : null;
}
