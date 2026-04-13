import { formatNumber, valClass, signStr, shortDate } from '../utils.js';

export function renderInstitutional(foreignData, trustData, brokerData) {
  const container = document.getElementById('institutional-table-container');

  // Merge all 3 sources by date
  const dateMap = {};

  if (foreignData) {
    for (const d of foreignData) {
      const date = d['日期'];
      if (!dateMap[date]) dateMap[date] = { date };
      dateMap[date].foreign = d['外資買賣超'];
      dateMap[date].foreignHold = d['外資持股比率'];
    }
  }
  if (trustData) {
    for (const d of trustData) {
      const date = d['日期'];
      if (!dateMap[date]) dateMap[date] = { date };
      dateMap[date].trust = d['投信買賣超'];
      dateMap[date].trustHold = d['投信持股比率'];
    }
  }
  if (brokerData) {
    for (const d of brokerData) {
      const date = d['日期'];
      if (!dateMap[date]) dateMap[date] = { date };
      dateMap[date].broker = d['自營商買賣超'];
    }
  }

  // Sort descending by date
  const rows = Object.values(dateMap).sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
  );

  // Calculate cumulative totals
  const ascending = [...rows].reverse();
  let cumF = 0, cumT = 0, cumB = 0;
  for (const r of ascending) {
    cumF += Number(r.foreign || 0);
    cumT += Number(r.trust || 0);
    cumB += Number(r.broker || 0);
    r.cumTotal = cumF + cumT + cumB;
  }

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>日期</th>
          <th>外資</th>
          <th>投信</th>
          <th>自營商</th>
          <th>合計</th>
          <th>累計</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          const total = (Number(r.foreign || 0) + Number(r.trust || 0) + Number(r.broker || 0));
          return `
          <tr>
            <td>${shortDate(r.date)}</td>
            <td class="${valClass(r.foreign)}">${r.foreign != null ? signStr(r.foreign) + formatNumber(r.foreign, 0) : '—'}</td>
            <td class="${valClass(r.trust)}">${r.trust != null ? signStr(r.trust) + formatNumber(r.trust, 0) : '—'}</td>
            <td class="${valClass(r.broker)}">${r.broker != null ? signStr(r.broker) + formatNumber(r.broker, 0) : '—'}</td>
            <td class="${valClass(total)}">${signStr(total)}${formatNumber(total, 0)}</td>
            <td class="${valClass(r.cumTotal)}">${signStr(r.cumTotal)}${formatNumber(r.cumTotal, 0)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  // Render summary cards below the table
  renderSummaryCards(foreignData, trustData, brokerData);
}

function renderSummaryCards(foreignData, trustData, brokerData) {
  const container = document.getElementById('institutional-cards');
  const fLatest = foreignData?.[0];
  const tLatest = trustData?.[0];
  const bLatest = brokerData?.[0];

  container.innerHTML = `
    <div class="info-card">
      <div class="card-label">外資</div>
      <div class="card-value ${valClass(fLatest?.['外資買賣超'])}">
        ${fLatest ? signStr(fLatest['外資買賣超']) + formatNumber(fLatest['外資買賣超'], 0) + ' 張' : '—'}
      </div>
      <div class="text-xs text-muted mt-2">
        ${fLatest?.['外資持股比率'] != null ? `持股比率 ${fLatest['外資持股比率']}%` : ''}
      </div>
    </div>

    <div class="info-card">
      <div class="card-label">投信</div>
      <div class="card-value ${valClass(tLatest?.['投信買賣超'])}">
        ${tLatest ? signStr(tLatest['投信買賣超']) + formatNumber(tLatest['投信買賣超'], 0) + ' 張' : '—'}
      </div>
      <div class="text-xs text-muted mt-2">
        ${tLatest?.['投信持股比率'] != null ? `持股比率 ${tLatest['投信持股比率']}%` : ''}
      </div>
    </div>

    <div class="info-card">
      <div class="card-label">自營商</div>
      <div class="card-value ${valClass(bLatest?.['自營商買賣超'])}">
        ${bLatest ? signStr(bLatest['自營商買賣超']) + formatNumber(bLatest['自營商買賣超'], 0) + ' 張' : '—'}
      </div>
      <div class="text-xs text-muted mt-2">
        ${bLatest?.['自營商買賣超_自行買賣'] != null ? `自行 ${signStr(bLatest['自營商買賣超_自行買賣'])}${formatNumber(bLatest['自營商買賣超_自行買賣'], 0)}` : ''}
      </div>
    </div>
  `;
}
