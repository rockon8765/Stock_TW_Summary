import {
  calcRate,
  escapeHtml,
  formatNumber,
  formatPercent,
  formatRevenueFromThousand,
  showNotApplicable,
  sortDescByKey,
  valClassLevel,
} from "../utils.js";

export function renderIncome(data) {
  const container = document.getElementById('income-table-container');
  if (!container) return;

  if (!Array.isArray(data) || data.length === 0) {
    showNotApplicable(container, "此標的暫無季度損益資料");
    return;
  }

  // Sort descending (newest first)
  const sorted = sortDescByKey(data, "年季");

  const rows = sorted.map(d => {
    const rev = d['營業收入淨額'];
    const gross = d['營業毛利淨額'];
    const op = d['營業利益'];
    const net = d['稅後純益'];
    const eps = d['每股稅後盈餘'];

    const grossM = calcRate(gross, rev);
    const opM = calcRate(op, rev);
    const netM = calcRate(net, rev);

    return {
      quarter: d["年季"],
      rev,
      grossM,
      opM,
      netM,
      eps,
    };
  });

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>年季</th>
          <th>營收淨額</th>
          <th>毛利率</th>
          <th>營益率</th>
          <th>淨利率</th>
          <th>EPS</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${escapeHtml(r.quarter || "")}</td>
            <td>${formatRevenueFromThousand(r.rev, "營業收入淨額")}</td>
            <td class="${valClassLevel(r.grossM)}">${formatPercent(r.grossM, 2, "毛利率")}</td>
            <td class="${valClassLevel(r.opM)}">${formatPercent(r.opM, 2, "營益率")}</td>
            <td class="${valClassLevel(r.netM)}">${formatPercent(r.netM, 2, "淨利率")}</td>
            <td class="${valClassLevel(r.eps)}">${r.eps != null ? formatNumber(r.eps, 2, "每股稅後盈餘") : "—"}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
