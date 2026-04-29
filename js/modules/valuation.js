import {
  calcRate,
  escapeHtml,
  formatNumber,
  formatPercent,
  showNotApplicable,
  sortDescByKey,
  valClassLevel,
  valueFromThousandToYi,
} from "../utils.js";

export function renderValuation(incomeData, bsData) {
  const container = document.getElementById("valuation-table-container");
  if (!container) return;

  if (!incomeData?.length) {
    showNotApplicable(container, "此標的暫無估值趨勢資料");
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
    const eps = d["每股稅後盈餘"];
    const grossM = calcRate(gross, rev);
    const opM = calcRate(op, rev);
    const bv = bsMap[quarter]?.["每股淨值"];
    return {
      quarter,
      revYi: valueFromThousandToYi(rev, "營業收入淨額"),
      grossM,
      opM,
      eps,
      bv,
    };
  });

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>年季</th>
          <th>營收(億)</th>
          <th>毛利率</th>
          <th>營益率</th>
          <th>稅後EPS</th>
          <th>每股淨值</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td>${escapeHtml(r.quarter || "")}</td>
            <td>${r.revYi != null ? formatNumber(r.revYi, 2, "營業收入淨額") : "—"}</td>
            <td class="${valClassLevel(r.grossM)}">${formatPercent(r.grossM, 2, "毛利率")}</td>
            <td class="${valClassLevel(r.opM)}">${formatPercent(r.opM, 2, "營益率")}</td>
            <td class="${valClassLevel(r.eps)}">${r.eps != null ? formatNumber(r.eps, 2, "每股稅後盈餘") : "—"}</td>
            <td>${r.bv != null ? formatNumber(r.bv, 2) : "—"}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}
