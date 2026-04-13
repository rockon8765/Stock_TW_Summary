import { formatPercent, valClass, showError } from '../utils.js';

let holdingData = null;
let tradeData = null;
const DEFAULT_STRATEGY_DATA_BASE_URL = 'data/';

function parseCSV(text) {
  // Strip BOM if present
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      row[h.trim()] = vals[i]?.trim() ?? '';
    });
    return row;
  });
}

function normalizeBaseUrl(baseUrl = DEFAULT_STRATEGY_DATA_BASE_URL) {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

export function getStrategyDataUrls(baseUrl = DEFAULT_STRATEGY_DATA_BASE_URL) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return {
    holding: `${normalizedBaseUrl}strategy_ticker_holding_summary.csv`,
    trade: `${normalizedBaseUrl}strategy_ticker_trade_analysis_summary.csv`,
  };
}

async function loadStrategyDataFromUrls(urls) {
  const [holdingRes, tradeRes] = await Promise.all([
    fetch(urls.holding),
    fetch(urls.trade),
  ]);

  if (!holdingRes.ok || !tradeRes.ok) {
    throw new Error('strategy data fetch failed');
  }

  const [holdingText, tradeText] = await Promise.all([
    holdingRes.text(),
    tradeRes.text(),
  ]);

  holdingData = parseCSV(holdingText);
  tradeData = parseCSV(tradeText);
}

export async function loadStrategyData() {
  const configuredBaseUrl = globalThis.STOCK_ONE_PAGE_CONFIG?.strategyDataBaseUrl;
  const candidateUrls = [
    getStrategyDataUrls(configuredBaseUrl),
    getStrategyDataUrls(),
  ].filter((urls, index, all) => {
    return index === all.findIndex(item => item.holding === urls.holding && item.trade === urls.trade);
  });

  try {
    for (const urls of candidateUrls) {
      try {
        await loadStrategyDataFromUrls(urls);
        return;
      } catch {
        // Try the next configured location before failing the module.
      }
    }

    holdingData = [];
    tradeData = [];
  } catch {
    holdingData = [];
    tradeData = [];
  }
}

function filterByTicker(data, ticker) {
  return data.filter(r => r['股票代號'] === ticker);
}

function buildTable(rows) {
  if (!rows.length) {
    return '<div class="text-slate-500 text-sm text-center py-6">此股票無策略資料</div>';
  }

  // Sort by average return descending
  const sorted = [...rows].sort((a, b) => Number(b['平均報酬率'] || 0) - Number(a['平均報酬率'] || 0));

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
        ${sorted.map(r => {
          const winRate = Number(r['平均勝率'] || 0) * 100;
          const ret = Number(r['平均報酬率'] || 0) * 100;
          const days = Number(r['平均持有天數'] || 0);
          return `
            <tr>
              <td>${r['策略名稱'] || ''}</td>
              <td>${r['樣本數'] || ''}</td>
              <td class="${valClass(winRate - 50)}">${formatPercent(winRate)}</td>
              <td class="${valClass(ret)}">${formatPercent(ret)}</td>
              <td>${Math.round(days)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

export function renderStrategy(ticker) {
  const holdingContainer = document.getElementById('strategy-holding-container');
  const tradeContainer = document.getElementById('strategy-trade-container');

  if (!holdingData || !tradeData) {
    showError(holdingContainer, '策略資料載入失敗');
    showError(tradeContainer, '策略資料載入失敗');
    return;
  }

  const holdingRows = filterByTicker(holdingData, ticker);
  const tradeRows = filterByTicker(tradeData, ticker);

  holdingContainer.innerHTML = buildTable(holdingRows);
  tradeContainer.innerHTML = buildTable(tradeRows);
}
