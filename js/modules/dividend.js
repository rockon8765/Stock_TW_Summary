import {
  FIELD,
  escapeHtml,
  formatNumber,
  formatPercent,
  safeDiv,
  showNotApplicable,
  sortAscByKey,
} from "../utils.js";

/**
 * 從日 OHLCV 陣列中，找出每個年度的最後一個交易日收盤價。
 * @param {Array<Object>|null|undefined} quotes md_cm_ta_dailyquotes
 * @returns {Map<string, number>} 年度 → 年末收盤價
 */
function yearEndClosesFromQuotes(quotes) {
  const map = new Map();
  if (!Array.isArray(quotes)) return map;
  // 以日期升冪掃描；後覆蓋前 → 同年度最後進入的為該年度最後交易日
  const sorted = sortAscByKey(quotes, "日期");
  for (const row of sorted) {
    const date = String(row?.["日期"] ?? "");
    if (date.length < 4) continue;
    const year = date.slice(0, 4);
    const close = Number(row?.["收盤價"]);
    if (Number.isFinite(close)) map.set(year, close);
  }
  return map;
}

/**
 * 從年度損益表陣列建立 年度 → EPS 的索引。
 * 偏好 `每股稅後盈餘`；若無則退回 `原始每股稅後盈餘`。
 * @param {Array<Object>|null|undefined} annualIs md_cm_fi_is_annual
 * @returns {Map<string, number>}
 */
function annualEpsIndex(annualIs) {
  const map = new Map();
  if (!Array.isArray(annualIs)) return map;
  for (const row of annualIs) {
    const year = row?.["年度"] != null ? String(row["年度"]) : null;
    if (!year) continue;
    const eps = Number(row?.[FIELD.EPS] ?? row?.[FIELD.EPS_RAW]);
    if (Number.isFinite(eps)) map.set(year, eps);
  }
  return map;
}

/**
 * 渲染「近 10 年股利」表格（既有區塊，修正後）。
 *
 * - 股利金額欄：10Y 完整
 * - 年度現金殖利率：只在 quotes 涵蓋年度有值（約 5Y），older 顯示「—」
 * - 年度發放率：僅已結年度（annualIs 有該年度）有值；未結年度顯示「—」+ tooltip
 *
 * @param {Object} params
 * @param {Array<Object>} params.annualDiv 聚合後年度股利（由 aggregateDividendsToAnnual 產生）
 * @param {Array<Object>|null|undefined} params.quotes md_cm_ta_dailyquotes（5Y 日價）
 * @param {Array<Object>|null|undefined} params.annualIs md_cm_fi_is_annual（10Y 已結年度損益）
 */
export function renderDividend({ annualDiv, quotes, annualIs }) {
  const container = document.getElementById("dividend-table-container");
  if (!container) return;

  if (!Array.isArray(annualDiv) || annualDiv.length === 0) {
    showNotApplicable(container, "此標的暫無股利發放資料");
    return;
  }

  // 截取最新 10 年以對齊 index.html 的「近 10 年」標題；aggregator 已由新到舊排序
  const rows = annualDiv.slice(0, 10);

  const yearEndClose = yearEndClosesFromQuotes(quotes);
  const epsByYear = annualEpsIndex(annualIs);

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>年度</th>
          <th>現金股利</th>
          <th>股票股利</th>
          <th>股利合計</th>
          <th>年度現金殖利率</th>
          <th>年度發放率</th>
          <th>除息日</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((d) => {
            const close = yearEndClose.get(d.年度);
            const yieldPct =
              close != null ? safeDiv(d.年度現金股利, close) : null;
            const yieldCell =
              yieldPct != null
                ? formatPercent(yieldPct * 100)
                : `<span class="text-muted" title="資料範圍限制">—</span>`;

            const eps = epsByYear.get(d.年度);
            const payoutPct = eps != null ? safeDiv(d.年度現金股利, eps) : null;
            const payoutCell =
              payoutPct != null
                ? formatPercent(payoutPct * 100)
                : `<span class="text-muted" title="年度財報尚未公布">—</span>`;

            return `
              <tr>
                <td>${escapeHtml(d.年度)}</td>
                <td>${formatNumber(d.年度現金股利, 2)}</td>
                <td>${formatNumber(d.年度股票股利, 2)}</td>
                <td>${formatNumber(d.年度股利合計, 2)}</td>
                <td>${yieldCell}</td>
                <td>${payoutCell}</td>
                <td class="text-muted">${escapeHtml(d.除息日 || "—")}</td>
              </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}
