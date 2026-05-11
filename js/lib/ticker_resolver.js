import { ensureStrategyDataLoaded } from "../modules/strategy.js";

let cachedIndex = null;

function buildIndexFromHolding(holdingData) {
  const names = new Map();
  for (const row of holdingData) {
    const code = String(row?.["股票代號"] ?? "").trim();
    const name = String(row?.["股票名稱"] ?? "").trim();
    if (!code || !name) continue;
    names.set(name, code);
  }
  return { names };
}

export function resetTickerResolverForTests() {
  cachedIndex = null;
}

export async function resolveTickerInput(input, deps = {}) {
  const ensureLoad = deps.ensureLoad ?? ensureStrategyDataLoaded;
  const text = String(input ?? "").trim();
  if (!text) return null;
  if (/^\d{4,6}[A-Z]?$/.test(text)) return text;

  if (!cachedIndex) {
    const state = await ensureLoad();
    if (state?.status !== "loaded") return null;
    cachedIndex = buildIndexFromHolding(state.holdingData ?? []);
  }

  if (cachedIndex.names.has(text)) return cachedIndex.names.get(text);

  const matches = [...cachedIndex.names.entries()].filter(([name]) =>
    name.includes(text),
  );
  return matches.length === 1 ? matches[0][1] : null;
}
