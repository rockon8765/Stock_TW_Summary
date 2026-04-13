import { formatNumber, formatPercent, calcRate, valClass } from "../utils.js";

export function renderValuation(incomeData, bsData) {
  const container = document.getElementById("valuation-table-container");
  if (!container) return;

  if (!incomeData?.length) {
    container.innerHTML = '<div class="section-error">無估值趨勢資料</div>';
    return;
  }

  const bsMap = {};
  if (bsData) {
    for (const row of bsData) {
      bsMap[row["年季"]] = row;
    }
  }

  const sorted = [...incomeData].sort((a, b) =>
    String(b["年季"]).localeCompare(String(a["年季"])),
  );

  const rows = sorted.map((d) => {
    const quarter = d["年季"];
    const rev = d["營業收入淨額"];
    const gross = d["營業毛利淨額"];
    const op = d["營業利益"];
    const eps = d["每股稅後盈餘"];
    const grossM = calcRate(gross, rev);
    const opM = calcRate(op, rev);
    const bv = bsMap[quarter]?.["每股淨值"];
    return { quarter, rev, grossM, opM, eps, bv };
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
            <td>${r.quarter || ""}</td>
            <td>${r.rev != null ? formatNumber(r.rev / 1e8, 2) : "—"}</td>
            <td class="${valClass(r.grossM)}">${formatPercent(r.grossM)}</td>
            <td class="${valClass(r.opM)}">${formatPercent(r.opM)}</td>
            <td class="${valClass(r.eps)}">${r.eps != null ? formatNumber(r.eps, 2) : "—"}</td>
            <td>${r.bv != null ? formatNumber(r.bv, 2) : "—"}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}
