import {
  calcRate,
  escapeHtml,
  formatNumber,
  formatPercent,
  formatRevenueFromThousand,
  formatYearQuarter,
  showNotApplicable,
  sortDescByKey,
  valClassLevel,
} from "../utils.js";

/**
 * 季度財務（近 8 季）— 整併原「估值趨勢」與「季度損益」兩區塊。
 * 7 欄：年季 / 營收淨額 / 毛利率 / 營益率 / 淨利率 / EPS / 每股淨值
 *
 * @param {Array<Object>} incomeData  fetchQuarterlyIncome 回傳的季度損益資料
 * @param {Array<Object>} bsData      fetchQuarterlyBS 回傳的季度資產負債資料（為了取「每股淨值」）
 */
export function renderValuation(incomeData, bsData) {
  const container = document.getElementById("valuation-table-container");
  if (!container) return;

  if (!incomeData?.length) {
    showNotApplicable(container, "此標的暫無季度財務資料");
    return;
  }

  const bsMap = {};
  if (bsData) {
    for (const row of bsData) {
      bsMap[row["年季"]] = row;
    }
  }

  const sorted = sortDescByKey(incomeData, "年季").slice(0, 8);

  const rows = sorted.map((d) => {
    const quarter = d["年季"];
    const rev = d["營業收入淨額"];
    const gross = d["營業毛利淨額"];
    const op = d["營業利益"];
    const net = d["稅後純益"];
    const eps = d["每股稅後盈餘"];
    const grossM = calcRate(gross, rev);
    const opM = calcRate(op, rev);
    const netM = calcRate(net, rev);
    const bv = bsMap[quarter]?.["每股淨值"];
    return {
      quarter,
      rev,
      grossM,
      opM,
      netM,
      eps,
      bv,
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
          <th>每股淨值</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td>${escapeHtml(formatYearQuarter(r.quarter))}</td>
            <td>${formatRevenueFromThousand(r.rev, "營業收入淨額")}</td>
            <td class="${valClassLevel(r.grossM)}">${formatPercent(r.grossM, 2, "毛利率")}</td>
            <td class="${valClassLevel(r.opM)}">${formatPercent(r.opM, 2, "營益率")}</td>
            <td class="${valClassLevel(r.netM)}">${formatPercent(r.netM, 2, "淨利率")}</td>
            <td class="${valClassLevel(r.eps)}">${r.eps != null ? formatNumber(r.eps, 2, "每股稅後盈餘") : "—"}</td>
            <td>${r.bv != null ? formatNumber(r.bv, 2) : "—"}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}
