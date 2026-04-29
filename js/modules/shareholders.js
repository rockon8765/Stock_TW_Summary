import {
  escapeHtml,
  formatPercent,
  shortDate,
  showNotApplicable,
  signStr,
  sortDescByKey,
  valClass,
} from "../utils.js";

export function renderShareholders(data) {
  const container = document.getElementById("shareholders-table-container");
  if (!container) return;

  if (!data || !data.length) {
    showNotApplicable(container, "此標的暫無股權分散資料");
    return;
  }

  // Sort descending by date (newest first)
  const sorted = sortDescByKey(data, "日期");

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>日期</th>
          <th>1000張以上</th>
          <th>400張以上</th>
          <th>100~400張</th>
          <th>100張以下</th>
        </tr>
      </thead>
      <tbody>
        ${sorted
          .map((d, i) => {
            const big1000 = d["1000張以上佔集保比率"];
            const above400 = d["400張以上佔集保比率"];
            const below100 = d["100張以下佔集保比率"];
            const mid =
              above400 != null && big1000 != null && below100 != null
                ? Math.max(0, 100 - above400 - below100)
                : null;

            // Calculate week-over-week change
            const prev = sorted[i + 1];
            const big1000Chg =
              prev && big1000 != null && prev["1000張以上佔集保比率"] != null
                ? big1000 - prev["1000張以上佔集保比率"]
                : null;

            return `
          <tr>
            <td>${escapeHtml(shortDate(d["日期"]))}</td>
            <td>
              ${formatPercent(big1000)}
              ${big1000Chg != null ? `<span class="text-xs ${valClass(big1000Chg)}">${signStr(big1000Chg)}${Math.abs(big1000Chg).toFixed(2)}</span>` : ""}
            </td>
            <td>${formatPercent(above400)}</td>
            <td>${formatPercent(mid)}</td>
            <td>${formatPercent(below100)}</td>
          </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}
