import { formatNumber, formatPercent } from "../utils.js";

export function renderDividend(data) {
  const container = document.getElementById("dividend-table-container");
  if (!container) return;

  if (!data?.length) {
    container.innerHTML = '<div class="section-error">無股利發放資料</div>';
    return;
  }

  const sorted = [...data].sort((a, b) =>
    String(b["年季"]).localeCompare(String(a["年季"])),
  );

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>年度</th>
          <th>現金股利</th>
          <th>股票股利</th>
          <th>股利合計</th>
          <th>現金殖利率</th>
          <th>發放率</th>
          <th>除息日</th>
        </tr>
      </thead>
      <tbody>
        ${sorted
          .map(
            (d) => `
          <tr>
            <td>${d["年季"] || ""}</td>
            <td>${formatNumber(d["現金股利合計"], 2)}</td>
            <td>${formatNumber(d["股票股利合計"], 2)}</td>
            <td>${formatNumber(d["股利合計"], 2)}</td>
            <td>${formatPercent(d["現金股利殖利率"])}</td>
            <td>${formatPercent(d["股利發放率"])}</td>
            <td class="text-muted">${d["除息日"] || "—"}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}
