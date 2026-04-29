import { escapeHtml, showError, showNotApplicable } from "../utils.js";

let currentSort = { key: "score", dir: "desc" };

/**
 * 渲染策略買入分數表（K 線之後、估值之前）。
 *
 * @param {{ strategies: Array, tickers: Object, as_of: string }|null} strategySnapshot
 * @param {string} ticker
 */
export function renderStrategyScores(strategySnapshot, ticker) {
  const el = document.getElementById("strategy-scores-container");
  if (!el) return;

  if (!strategySnapshot) {
    showError(
      el,
      "策略分數快照未就緒（可能是網路失敗或缺少 scorecard_web.json）",
      {
        retrySection: "strategy-scores",
        retryTicker: ticker,
      },
    );
    return;
  }

  const tickerData = strategySnapshot.tickers?.[String(ticker)];
  const scoresMap = tickerData?.strategy_scores || {};
  const strategiesMeta = strategySnapshot.strategies || [];

  if (Object.keys(scoresMap).length === 0) {
    showNotApplicable(el, "此股未被任何策略評分");
    return;
  }

  // 組合 rows：{ name, score, latest_date, is_stale }
  const metaByName = new Map(strategiesMeta.map((s) => [s.name, s]));
  const rows = Object.entries(scoresMap).map(([name, score]) => {
    const meta = metaByName.get(name) || {};
    return {
      name,
      score: Number(score),
      latest_date: meta.latest_date || "—",
      is_stale: Boolean(meta.is_stale),
    };
  });

  sortRows(rows, currentSort);
  renderTable(el, rows, strategySnapshot.as_of);

  // Sort handler — 事件委派綁在 container 上，renderTable 重繪 DOM 後仍有效
  el.onclick = (event) => {
    const th = event.target.closest("th[data-sort-key]");
    if (!th || !el.contains(th)) return;

    const key = th.dataset.sortKey;
    if (currentSort.key === key) {
      currentSort.dir = currentSort.dir === "asc" ? "desc" : "asc";
    } else {
      currentSort.key = key;
      currentSort.dir = key === "name" ? "asc" : "desc";
    }

    sortRows(rows, currentSort);
    renderTable(el, rows, strategySnapshot.as_of);
  };
}

function sortRows(rows, { key, dir }) {
  const mul = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    let av = a[key];
    let bv = b[key];
    if (typeof av === "string") return av.localeCompare(bv) * mul;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * mul;
  });
}

function sortIndicator(key, curr) {
  if (curr.key !== key) return "";
  return curr.dir === "asc" ? " ▲" : " ▼";
}

function ariaSortValue(key, curr) {
  if (curr.key !== key) return "none";
  return curr.dir === "asc" ? "ascending" : "descending";
}

function renderTable(el, rows, asOf) {
  const curr = currentSort;
  el.innerHTML = `
    <div class="strategy-scores-header">
      <span class="muted">as of ${escapeHtml(asOf || "—")}，共 ${rows.length} 檔策略有分數</span>
    </div>
    <div class="overflow-x-auto">
      <table class="data-table strategy-scores-table">
        <thead>
          <tr>
            <th scope="col" data-sort-key="name" class="cursor-pointer" aria-sort="${ariaSortValue("name", curr)}">策略${sortIndicator("name", curr)}</th>
            <th scope="col" data-sort-key="score" class="cursor-pointer" aria-sort="${ariaSortValue("score", curr)}">分數${sortIndicator("score", curr)}</th>
            <th scope="col" data-sort-key="latest_date" class="cursor-pointer" aria-sort="${ariaSortValue("latest_date", curr)}">資料新鮮度${sortIndicator("latest_date", curr)}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r) => {
              const staleClass = r.is_stale
                ? "strategy-score-row stale"
                : "strategy-score-row";
              const freshness = r.is_stale
                ? `<span class="stale-badge">過時 ${r.latest_date}</span>`
                : `<span class="fresh-badge">最新 ${r.latest_date}</span>`;
              return `
                <tr class="${staleClass}">
                  <td class="mono">${escapeHtml(r.name)}</td>
                  <td>${Math.round(r.score * 100)}</td>
                  <td>${r.is_stale ? `<span class="stale-badge">過時 ${escapeHtml(r.latest_date)}</span>` : `<span class="fresh-badge">最新 ${escapeHtml(r.latest_date)}</span>`}</td>
                </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}
