import { formatRevenue, formatPercent, valClass } from '../utils.js';

export function renderRevenue(data) {
  const tableContainer = document.getElementById('revenue-table-container');

  // Sort descending (newest first)
  const rows = [...data].sort((a, b) =>
    String(b['年月']).localeCompare(String(a['年月']))
  );

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
            <td>${d['年月'] || ''}</td>
            <td>${formatRevenue(d['單月合併營收'])}</td>
            <td class="${valClass(d['單月合併營收月變動'])}">${formatPercent(d['單月合併營收月變動'])}</td>
            <td class="${valClass(d['單月合併營收年成長'])}">${formatPercent(d['單月合併營收年成長'])}</td>
            <td>${formatRevenue(d['累計合併營收'])}</td>
            <td class="${valClass(d['累計合併營收成長'])}">${formatPercent(d['累計合併營收成長'])}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
