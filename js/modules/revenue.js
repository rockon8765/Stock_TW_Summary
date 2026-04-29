import {
  escapeHtml,
  formatPercent,
  formatRevenueFromThousand,
  showNotApplicable,
  signStr,
  sortDescByKey,
  valClassChange,
} from "../utils.js";

export function renderRevenue(data) {
  const tableContainer = document.getElementById('revenue-table-container');
  if (!tableContainer) return;

  if (!Array.isArray(data) || data.length === 0) {
    showNotApplicable(tableContainer, "無月營收資料");
    return;
  }

  // Sort descending (newest first)
  const rows = sortDescByKey(data, "年月");

  tableContainer.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>年月</th>
          <th>單月營收</th>
          <th>MoM%</th>
          <th>YoY%</th>
          <th>累計營收</th>
          <th>累計 YoY%</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(d => `
          <tr>
            <td>${escapeHtml(d["年月"] || "")}</td>
            <td>${formatRevenueFromThousand(d["單月合併營收"], "單月合併營收")}</td>
            <td class="${valClassChange(d["單月合併營收月變動"])}">${signStr(d["單月合併營收月變動"])}${formatPercent(d["單月合併營收月變動"], 2, "單月合併營收月變動")}</td>
            <td class="${valClassChange(d["單月合併營收年成長"])}">${signStr(d["單月合併營收年成長"])}${formatPercent(d["單月合併營收年成長"], 2, "單月合併營收年成長")}</td>
            <td>${formatRevenueFromThousand(d["累計合併營收"], "累計合併營收")}</td>
            <td class="${valClassChange(d["累計合併營收成長"])}">${signStr(d["累計合併營收成長"])}${formatPercent(d["累計合併營收成長"], 2, "累計合併營收成長")}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
