import {
  escapeHtml,
  formatPercent,
  formatRevenueFromThousand,
  formatYearMonth,
  showNotApplicable,
  safeDiv,
  signStr,
  sortAscByKey,
  sortDescByKey,
  valClassChange,
} from "../utils.js";

const DISPLAY_MONTHS = 12;

function pctChange(current, previous) {
  const ratio = safeDiv(current - previous, Math.abs(previous));
  return ratio == null ? null : ratio * 100;
}

function sumWindow(rows, endIndex, windowSize) {
  const startIndex = endIndex - windowSize + 1;
  if (startIndex < 0) return null;
  let sum = 0;
  for (let index = startIndex; index <= endIndex; index++) {
    const value = Number(rows[index]?.["單月合併營收"]);
    if (!Number.isFinite(value)) return null;
    sum += value;
  }
  return sum;
}

function computeRollingYoy(rowsAsc, monthIndex, windowSize) {
  const current = sumWindow(rowsAsc, monthIndex, windowSize);
  const previous = sumWindow(rowsAsc, monthIndex - 12, windowSize);
  if (current == null || previous == null || previous === 0) return null;
  return pctChange(current, previous);
}

function formatSignedPercent(value, fieldName) {
  return `${signStr(value)}${formatPercent(value, 2, fieldName)}`;
}

export function renderRevenue(data) {
  const tableContainer = document.getElementById("revenue-table-container");
  if (!tableContainer) return;

  if (!Array.isArray(data) || data.length === 0) {
    showNotApplicable(tableContainer, "無月營收資料");
    return;
  }

  const rowsAsc = sortAscByKey(data, "年月");
  const monthToIndex = new Map(
    rowsAsc.map((row, index) => [String(row?.["年月"] ?? ""), index]),
  );
  const rows = sortDescByKey(data, "年月").slice(0, DISPLAY_MONTHS);

  tableContainer.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>年月</th>
          <th>單月營收</th>
          <th>MoM%</th>
          <th>單月 YoY%</th>
          <th>3M YoY%</th>
          <th>12M TTM YoY%</th>
          <th>累計營收</th>
          <th>累計 YTD YoY%</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((d) => {
          const monthIndex = monthToIndex.get(String(d?.["年月"] ?? ""));
          const rolling3m = Number.isInteger(monthIndex)
            ? computeRollingYoy(rowsAsc, monthIndex, 3)
            : null;
          const ttm12m = Number.isInteger(monthIndex)
            ? computeRollingYoy(rowsAsc, monthIndex, 12)
            : null;
          return `
          <tr>
            <td>${escapeHtml(formatYearMonth(d["年月"]))}</td>
            <td>${formatRevenueFromThousand(d["單月合併營收"], "單月合併營收")}</td>
            <td class="${valClassChange(d["單月合併營收月變動"])}">${formatSignedPercent(d["單月合併營收月變動"], "單月合併營收月變動")}</td>
            <td class="${valClassChange(d["單月合併營收年成長"])}">${formatSignedPercent(d["單月合併營收年成長"], "單月合併營收年成長")}</td>
            <td class="${valClassChange(rolling3m)}">${formatSignedPercent(rolling3m, "3M Rolling YoY")}</td>
            <td class="${valClassChange(ttm12m)}">${formatSignedPercent(ttm12m, "12M TTM YoY")}</td>
            <td>${formatRevenueFromThousand(d["累計合併營收"], "累計合併營收")}</td>
            <td class="${valClassChange(d["累計合併營收成長"])}">${formatSignedPercent(d["累計合併營收成長"], "累計合併營收成長")}</td>
          </tr>
        `;
        }).join("")}
      </tbody>
    </table>
  `;
}
