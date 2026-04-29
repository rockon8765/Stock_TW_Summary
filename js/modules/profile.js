import {
  escapeHtml,
  formatNumber,
  formatPercent,
  showNotApplicable,
  signStr,
  sortDescByKey,
  valClassChange,
} from "../utils.js";

export function getLatestQuote(quotesData = []) {
  if (!Array.isArray(quotesData) || quotesData.length === 0) return null;
  return quotesData.reduce((latest, current) => {
    if (!latest?.["日期"]) return current;
    if (!current?.["日期"]) return latest;
    return current["日期"] > latest["日期"] ? current : latest;
  }, null);
}

function metricCard(label, value, decimals, suffix = "") {
  const display =
    value != null && !isNaN(value)
      ? formatNumber(value, decimals) + suffix
      : "—";
  return `
    <div class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${display}</div>
    </div>
  `;
}

function calcTrailing4qEPS(incomeData) {
  if (!incomeData?.length) return null;
  const sorted = sortDescByKey(incomeData, "年季");
  const recent4 = sorted.slice(0, 4);
  if (recent4.length < 4) return null;
  let sum = 0;
  for (const d of recent4) {
    const eps = d["每股稅後盈餘"];
    if (eps == null || isNaN(eps)) return null;
    sum += Number(eps);
  }
  return sum;
}

export function renderProfile(profileData, quotesData, bsData, incomeData) {
  const el = document.getElementById("profile-content");
  if (!el) return;

  const profile = Array.isArray(profileData)
    ? profileData[0] || null
    : profileData || null;
  const quote = getLatestQuote(quotesData);

  if (!profile && !quote) {
    showNotApplicable(el, "此標的暫無公司資料");
    return;
  }

  const ticker = profile?.["股票代號"] || quote?.["股票代號"] || "";
  const name = profile?.["股票名稱"] || quote?.["股票名稱"] || "";
  const fullName = profile?.["公司名稱"] || "";
  const industry = profile?.["產業名稱"] || "";
  const chairman = profile?.["董事長"] || "";
  const capital = profile?.["實收資本額"];
  const listDate = profile?.["上市日期"] || profile?.["上櫃日期"] || "";

  const close = quote?.["收盤價"];
  const change = quote?.["漲跌"];
  const changeP = quote?.["漲幅"];
  const date = quote?.["日期"] || "";

  const pe = quote?.["本益比"];
  const pe4 = quote?.["本益比4"];
  const pb = quote?.["股價淨值比"];
  const mktCap = quote?.["總市值"];
  const turnover = quote?.["週轉率"];

  const latestBS = bsData?.[0];
  const bv = latestBS?.["每股淨值"];
  const eps4q = calcTrailing4qEPS(incomeData);
  const safeTicker = escapeHtml(ticker);
  const safeName = escapeHtml(name);
  const safeFullName = escapeHtml(fullName);
  const safeIndustry = escapeHtml(industry);
  const safeChairman = escapeHtml(chairman);
  const safeListDate = escapeHtml(listDate);
  const safeDate = escapeHtml(date);

  el.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
      <div>
        <div class="flex items-baseline gap-3 mb-1">
          <span class="text-2xl font-bold">${safeTicker} ${safeName}</span>
          <span class="text-sm text-muted">${safeIndustry}</span>
        </div>
        <div class="text-sm text-muted space-x-4">
          ${fullName ? `<span>${safeFullName}</span>` : ""}
          ${chairman ? `<span>董事長：${safeChairman}</span>` : ""}
          ${capital ? `<span>資本額：${formatNumber(capital / 1e2, 2)} 億</span>` : ""}
          ${listDate ? `<span>上市：${safeListDate}</span>` : ""}
        </div>
      </div>
      ${
        close != null
          ? `
      <div class="text-right shrink-0">
        <div class="text-3xl font-bold ${valClassChange(change)}">${formatNumber(close, 2, "收盤價")}</div>
        <div class="text-sm ${valClassChange(change)}">
          ${signStr(change)}${formatNumber(change, 2, "漲跌")}（${signStr(changeP)}${formatPercent(changeP, 2, "漲幅")}）
        </div>
        <div class="text-xs text-muted mt-1">${safeDate}</div>
      </div>`
          : ""
      }
    </div>

    <div class="metric-cards">
      ${metricCard("PE", pe, 1)}
      ${metricCard("PE\u2084(預估)", pe4, 1)}
      ${metricCard("PB", pb, 2)}
      ${metricCard("每股淨值", bv, 2)}
      ${metricCard("EPS(近4季)", eps4q, 2)}
      ${metricCard("總市值", mktCap, 1, " 億")}
      ${metricCard("週轉率", turnover, 2, "%")}
    </div>
  `;
}
