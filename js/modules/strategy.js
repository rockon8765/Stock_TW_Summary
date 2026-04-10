import { formatPercent, valClass, showError } from '../utils.js';

let holdingData = null;
let tradeData = null;

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

export async function loadStrategyData() {
  try {
    const [holdingRes, tradeRes] = await Promise.all([
      fetch('data/strategy_ticker_holding_summary.csv'),
      fetch('data/strategy_ticker_trade_analysis_summary.csv'),
    ]);
    const [holdingText, tradeText] = await Promise.all([
      holdingRes.text(),
      tradeRes.text(),
    ]);
    holdingData = parseCSV(holdingText);
    tradeData = parseCSV(tradeText);
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
