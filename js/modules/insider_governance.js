import {
  escapeHtml,
  formatNumber,
  formatPercent,
  formatYearMonth,
  showNotApplicable,
  sortDescByKey,
} from "../utils.js";

/**
 * 渲染公司治理（內部人持股 + 設質）表格。
 * 顯示近 12 個月的：
 *   - 董監持股比例 / 增減
 *   - 經理人持股比例 / 增減
 *   - 大股東持股比例 / 增減
 *   - 董監設質比例 / 經理人設質比例 / 大股東設質比例
 * 設質比例 >30% 紅字、>50% 加紅底。
 *
 * @param {Array<Object>|null|undefined} insiderData md_cm_fd_insiderholdingstructure 近 12 個月
 */
export function renderInsiderGovernance(insiderData) {
  const container = document.getElementById("governance-table-container");
  if (!container) return;

  if (!Array.isArray(insiderData) || insiderData.length === 0) {
    showNotApplicable(container, "此標的暫無公司治理資料");
    return;
  }

  const sorted = sortDescByKey(insiderData, "年月");

  const pledgeCell = (pct) => {
    if (pct == null || !Number.isFinite(Number(pct))) return "—";
    const v = Number(pct);
    let cls = "";
    if (v > 50) cls = "val-down font-semibold";
    else if (v > 30) cls = "val-down";
    return `<span class="${cls}">${formatPercent(v)}</span>`;
  };

  const changeCell = (delta) => {
    if (delta == null || !Number.isFinite(Number(delta))) return "—";
    const v = Number(delta);
    const sign = v > 0 ? "+" : "";
    const cls = v > 0 ? "val-up" : v < 0 ? "val-down" : "text-muted";
    return `<span class="${cls}">${sign}${formatNumber(v, 3)}</span>`;
  };

  container.innerHTML = `
    <table class="data-table governance-table">
      <colgroup>
        <col class="gov-col-month">
        <col class="gov-col-pct"><col class="gov-col-delta"><col class="gov-col-pledge">
        <col class="gov-col-pct"><col class="gov-col-delta"><col class="gov-col-pledge">
        <col class="gov-col-pct"><col class="gov-col-delta"><col class="gov-col-pledge">
      </colgroup>
      <thead>
        <tr>
          <th rowspan="2">年月</th>
          <th colspan="3" class="group-start text-center">董監</th>
          <th colspan="3" class="group-start text-center">經理人</th>
          <th colspan="3" class="group-start text-center">大股東</th>
        </tr>
        <tr>
          <th class="text-center group-start">持股%</th>
          <th class="text-center">增減</th>
          <th class="text-center">設質%</th>
          <th class="text-center group-start">持股%</th>
          <th class="text-center">增減</th>
          <th class="text-center">設質%</th>
          <th class="text-center group-start">持股%</th>
          <th class="text-center">增減</th>
          <th class="text-center">設質%</th>
        </tr>
      </thead>
      <tbody>
        ${sorted
          .map(
            (r) => `
          <tr>
            <td>${escapeHtml(formatYearMonth(r["年月"]))}</td>
            <td class="text-center group-start">${formatPercent(r["董監持股比例"])}</td>
            <td class="text-center">${changeCell(r["董監持股比例增減"])}</td>
            <td class="text-center">${pledgeCell(r["董監設質比例"])}</td>
            <td class="text-center group-start">${formatPercent(r["經理人持股比例"])}</td>
            <td class="text-center">${changeCell(r["經理人持股比例增減"])}</td>
            <td class="text-center">${pledgeCell(r["經理人設質比例"])}</td>
            <td class="text-center group-start">${formatPercent(r["大股東持股比例"])}</td>
            <td class="text-center">${changeCell(r["大股東持股比例增減"])}</td>
            <td class="text-center">${pledgeCell(r["大股東設質比例"])}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}
