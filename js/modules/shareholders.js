import {
  escapeHtml,
  formatPercent,
  shortDate,
  showNotApplicable,
  signStr,
  sortDescByKey,
  valClass,
} from "../utils.js";

const midOf = (above400, below100) =>
  above400 != null && below100 != null
    ? Math.max(0, 100 - above400 - below100)
    : null;

const diff = (current, previous) =>
  current != null && previous != null ? current - previous : null;

const cell = (value, change) => `
  <td>
    ${formatPercent(value)}
    ${
      change != null
        ? `<span class="text-xs ${valClass(change)}">${change < 0 ? "-" : signStr(change)}${Math.abs(change).toFixed(2)}</span>`
        : ""
    }
  </td>`;

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
            const mid = midOf(above400, below100);

            // Calculate week-over-week change
            const prev = sorted[i + 1];
            const big1000Chg = diff(
              big1000,
              prev?.["1000張以上佔集保比率"],
            );
            const above400Chg = diff(
              above400,
              prev?.["400張以上佔集保比率"],
            );
            const below100Chg = diff(
              below100,
              prev?.["100張以下佔集保比率"],
            );
            const midChg = diff(
              mid,
              midOf(
                prev?.["400張以上佔集保比率"],
                prev?.["100張以下佔集保比率"],
              ),
            );

            return `
          <tr>
            <td>${escapeHtml(shortDate(d["日期"]))}</td>
            ${cell(big1000, big1000Chg)}
            ${cell(above400, above400Chg)}
            ${cell(mid, midChg)}
            ${cell(below100, below100Chg)}
          </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}
