import { escapeHtml, showError, showNotApplicable } from "../utils.js";

export const CATEGORY_REGEX = /^(F\d+)_/;
export const OTHER_CATEGORY = "其他";

let currentSort = { key: "max", dir: "desc" };

export function categorize(strategyName) {
  const match = CATEGORY_REGEX.exec(String(strategyName ?? ""));
  return match ? match[1] : OTHER_CATEGORY;
}

export function aggregateByCategory(strategiesMeta, scoresMap) {
  const buckets = new Map();
  const knownNames = new Set();

  for (const meta of strategiesMeta ?? []) {
    if (!meta?.name) continue;
    knownNames.add(meta.name);

    const category = categorize(meta.name);
    const bucket = getBucket(buckets, category);
    bucket.all.push(meta);
    if (meta.is_stale) bucket.staleCount += 1;

    const score = scoresMap?.[meta.name];
    const numericScore = toFiniteScore(score);
    if (numericScore != null) {
      bucket.scored.push({ name: meta.name, score: numericScore });
    }
  }

  for (const name of Object.keys(scoresMap ?? {})) {
    if (knownNames.has(name)) continue;

    const numericScore = toFiniteScore(scoresMap[name]);
    if (numericScore == null) continue;

    const category = categorize(name);
    const bucket = getBucket(buckets, category);
    bucket.all.push({ name, latest_date: null, is_stale: false });
    bucket.scored.push({ name, score: numericScore });
  }

  return Array.from(buckets, ([category, bucket]) =>
    summarizeCategory(category, bucket),
  );
}

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

  const rows = aggregateByCategory(strategiesMeta, scoresMap);
  sortRows(rows, currentSort);
  renderTable(el, rows, strategySnapshot.as_of);

  // Sort handler uses event delegation so it survives table re-renders.
  el.onclick = (event) => {
    const th = event.target.closest("th[data-sort-key]");
    if (!th || !el.contains(th)) return;

    const key = th.dataset.sortKey;
    if (currentSort.key === key) {
      currentSort.dir = currentSort.dir === "asc" ? "desc" : "asc";
    } else {
      currentSort.key = key;
      currentSort.dir = key === "category" ? "asc" : "desc";
    }

    sortRows(rows, currentSort);
    renderTable(el, rows, strategySnapshot.as_of);
  };
}

export function sortRows(rows, { key, dir }) {
  const mul = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string" || typeof bv === "string") {
      return String(av).localeCompare(String(bv)) * mul;
    }
    return (av - bv) * mul;
  });
}

function getBucket(buckets, category) {
  if (!buckets.has(category)) {
    buckets.set(category, { all: [], scored: [], staleCount: 0 });
  }
  return buckets.get(category);
}

function toFiniteScore(score) {
  if (score == null) return null;
  const numericScore = Number(score);
  return Number.isFinite(numericScore) ? numericScore : null;
}

function summarizeCategory(category, bucket) {
  const total = bucket.all.length;
  const scoredCount = bucket.scored.length;
  const allStale = total > 0 && bucket.staleCount === total;
  const displayCategory =
    category === OTHER_CATEGORY && total === 1
      ? bucket.all[0]?.name || category
      : category;

  if (scoredCount === 0) {
    return {
      category: displayCategory,
      total,
      scoredCount,
      mean: null,
      max: null,
      min: null,
      maxStrategy: null,
      minStrategy: null,
      allStale,
    };
  }

  let sum = 0;
  let max = -Infinity;
  let min = Infinity;
  let maxStrategy = null;
  let minStrategy = null;

  for (const item of bucket.scored) {
    sum += item.score;
    if (item.score > max) {
      max = item.score;
      maxStrategy = item.name;
    }
    if (item.score < min) {
      min = item.score;
      minStrategy = item.name;
    }
  }

  return {
    category: displayCategory,
    total,
    scoredCount,
    mean: sum / scoredCount,
    max,
    min,
    maxStrategy,
    minStrategy,
    allStale,
  };
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
      <span class="muted">as of ${escapeHtml(asOf || "—")}，共 ${rows.length} 個策略類別</span>
    </div>
    <div class="overflow-x-auto">
      <table class="data-table strategy-scores-table">
        <thead>
          <tr>
            <th scope="col" data-sort-key="category" class="cursor-pointer" aria-sort="${ariaSortValue("category", curr)}">策略類別${sortIndicator("category", curr)}</th>
            <th scope="col" data-sort-key="mean" class="cursor-pointer" aria-sort="${ariaSortValue("mean", curr)}">平均分${sortIndicator("mean", curr)}</th>
            <th scope="col" data-sort-key="max" class="cursor-pointer" aria-sort="${ariaSortValue("max", curr)}">最高分${sortIndicator("max", curr)}</th>
            <th scope="col" data-sort-key="min" class="cursor-pointer" aria-sort="${ariaSortValue("min", curr)}">最低分${sortIndicator("min", curr)}</th>
            <th scope="col" data-sort-key="scoredCount" class="cursor-pointer" aria-sort="${ariaSortValue("scoredCount", curr)}">覆蓋比例${sortIndicator("scoredCount", curr)}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(renderRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderRow(row) {
  const rowClass = row.allStale
    ? "strategy-category-row stale"
    : "strategy-category-row";
  const meanTitle =
    row.mean == null
      ? `${row.category} 類別在此股無評分（${row.scoredCount}/${row.total} 條策略）`
      : `${row.category} 平均 ${(row.mean * 100).toFixed(1)}（${row.scoredCount} 條策略）`;
  const maxTitle =
    row.maxStrategy == null
      ? "尚無評分"
      : `最高 ${(row.max * 100).toFixed(1)} 由 ${row.maxStrategy}`;
  const minTitle =
    row.minStrategy == null
      ? "尚無評分"
      : `最低 ${(row.min * 100).toFixed(1)} 由 ${row.minStrategy}`;

  return `
    <tr class="${rowClass}">
      <td class="mono">${escapeHtml(row.category)}</td>
      <td title="${escapeHtml(meanTitle)}">${formatScore(row.mean)}</td>
      <td title="${escapeHtml(maxTitle)}">${formatScore(row.max)}</td>
      <td title="${escapeHtml(minTitle)}">${formatScore(row.min)}</td>
      <td>${row.scoredCount} / ${row.total}</td>
    </tr>`;
}

function formatScore(score) {
  return score == null ? "—" : String(Math.round(score * 100));
}
