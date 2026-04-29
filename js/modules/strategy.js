import { APP_CONFIG } from "../config.js";
import {
  escapeHtml,
  formatPercent,
  showError,
  showNotApplicable,
  signStr,
  valClassChange,
} from "../utils.js";

const DEFAULT_STRATEGY_DATA_BASE_URL = "./";

function createStrategyDataState() {
  return {
    status: "idle",
    holdingData: [],
    tradeData: [],
    error: null,
    promise: null,
  };
}

let strategyDataState = createStrategyDataState();

export function parseCSV(text) {
  const clean = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];

    if (char === '"') {
      if (inQuotes && clean[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && clean[i + 1] === "\n") i += 1;
      row.push(value.trim());
      value = "";

      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.trim());
    if (row.some((cell) => cell !== "")) rows.push(row);
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = values[index] ?? "";
    });
    return entry;
  });
}

function normalizeBaseUrl(baseUrl = DEFAULT_STRATEGY_DATA_BASE_URL) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export function getStrategyDataUrls(baseUrl = DEFAULT_STRATEGY_DATA_BASE_URL) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return {
    holding: `${normalizedBaseUrl}strategy_ticker_holding_summary.csv`,
    trade: `${normalizedBaseUrl}strategy_ticker_trade_analysis_summary.csv`,
  };
}

async function loadStrategyDataFromUrls(urls, fetchImpl = fetch) {
  const [holdingRes, tradeRes] = await Promise.all([
    fetchImpl(urls.holding),
    fetchImpl(urls.trade),
  ]);

  if (!holdingRes.ok || !tradeRes.ok) {
    throw new Error("strategy data fetch failed");
  }

  const [holdingText, tradeText] = await Promise.all([
    holdingRes.text(),
    tradeRes.text(),
  ]);

  return {
    holdingData: parseCSV(holdingText),
    tradeData: parseCSV(tradeText),
  };
}

export function getStrategyDataState() {
  return {
    status: strategyDataState.status,
    holdingData: strategyDataState.holdingData,
    tradeData: strategyDataState.tradeData,
    error: strategyDataState.error,
  };
}

export function resetStrategyDataStateForTests() {
  strategyDataState = createStrategyDataState();
}

export function setStrategyDataStateForTests({
  status = "idle",
  holdingData = [],
  tradeData = [],
  error = null,
}) {
  strategyDataState = {
    status,
    holdingData,
    tradeData,
    error,
    promise: null,
  };
}

export async function loadStrategyData({
  baseUrl = APP_CONFIG.strategyDataBaseUrl,
  fetchImpl = fetch,
  force = false,
} = {}) {
  if (!force) {
    if (strategyDataState.status === "loaded") return getStrategyDataState();
    if (strategyDataState.promise) return strategyDataState.promise;
  }

  strategyDataState.status = "pending";
  strategyDataState.error = null;

  strategyDataState.promise = (async () => {
    try {
      const { holdingData, tradeData } = await loadStrategyDataFromUrls(
        getStrategyDataUrls(baseUrl),
        fetchImpl,
      );
      strategyDataState.status = "loaded";
      strategyDataState.holdingData = holdingData;
      strategyDataState.tradeData = tradeData;
      return getStrategyDataState();
    } catch (error) {
      strategyDataState.status = "failed";
      strategyDataState.holdingData = [];
      strategyDataState.tradeData = [];
      strategyDataState.error = error;
      return getStrategyDataState();
    } finally {
      strategyDataState.promise = null;
    }
  })();

  return strategyDataState.promise;
}

export function ensureStrategyDataLoaded(options) {
  if (strategyDataState.status === "loaded") {
    return Promise.resolve(getStrategyDataState());
  }
  if (strategyDataState.promise) return strategyDataState.promise;
  return loadStrategyData(options);
}

function filterByTicker(data, ticker) {
  return data.filter((row) => row["股票代號"] === ticker);
}

function buildTable(rows) {
  if (!rows.length) {
    return '<div class="section-empty">此股票無策略資料</div>';
  }

  const sorted = [...rows].sort(
    (a, b) => Number(b["平均報酬率"] || 0) - Number(a["平均報酬率"] || 0),
  );

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>策略</th>
          <th>樣本數</th>
          <th>勝率</th>
          <th>平均報酬</th>
          <th>持有天數</th>
        </tr>
      </thead>
      <tbody>
        ${sorted
          .map((row) => {
            const winRate = Number(row["平均勝率"] || 0) * 100;
            const ret = Number(row["平均報酬率"] || 0) * 100;
            const days = Number(row["平均持有天數"] || 0);
            return `
              <tr>
                <td>${escapeHtml(row["策略名稱"] || "")}</td>
                <td>${escapeHtml(row["樣本數"] || "")}</td>
                <td class="${valClassChange(winRate - 50)}">${formatPercent(winRate, 2, "平均勝率")}</td>
                <td class="${valClassChange(ret)}">${signStr(ret)}${formatPercent(ret, 2, "平均報酬率")}</td>
                <td>${Math.round(days)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderPending(container) {
  showNotApplicable(container, "策略資料載入中");
}

export function renderStrategy(ticker) {
  const holdingContainer = document.getElementById("strategy-holding-container");
  const tradeContainer = document.getElementById("strategy-trade-container");
  if (!holdingContainer || !tradeContainer) return;

  const state = getStrategyDataState();

  if (state.status === "pending" || state.status === "idle") {
    renderPending(holdingContainer);
    renderPending(tradeContainer);
    return;
  }

  if (state.status === "failed") {
    showError(holdingContainer, "策略資料載入失敗", {
      retrySection: "strategy",
      retryTicker: ticker,
    });
    showError(tradeContainer, "策略資料載入失敗", {
      retrySection: "strategy",
      retryTicker: ticker,
    });
    return;
  }

  const holdingRows = filterByTicker(state.holdingData, ticker);
  const tradeRows = filterByTicker(state.tradeData, ticker);

  holdingContainer.innerHTML = buildTable(holdingRows);
  tradeContainer.innerHTML = buildTable(tradeRows);
}
