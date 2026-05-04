import {
  escapeHtml,
  formatNumber,
  formatPercent,
  safeDiv,
  signStr,
  sortAscByKey,
  sortDescByKey,
  valClassChange,
} from "../utils.js";

function latestQuote(quotes) {
  return sortDescByKey(quotes, "日期")[0] ?? null;
}

function sumWindow(rows, endIndex, size, field) {
  const start = endIndex - size + 1;
  if (start < 0) return null;
  let sum = 0;
  for (let index = start; index <= endIndex; index++) {
    const value = Number(rows[index]?.[field]);
    if (!Number.isFinite(value)) return null;
    sum += value;
  }
  return sum;
}

function computeTtmSalesYoy(sales) {
  const rows = sortAscByKey(sales, "年月");
  const endIndex = rows.length - 1;
  const current = sumWindow(rows, endIndex, 12, "單月合併營收");
  const previous = sumWindow(rows, endIndex - 12, 12, "單月合併營收");
  const ratio =
    current != null && previous != null
      ? safeDiv(current - previous, Math.abs(previous))
      : null;
  return ratio == null ? null : ratio * 100;
}

function computeEpsTtmYoy(income) {
  const rows = sortDescByKey(income, "年季");
  const latest = rows.slice(0, 4);
  const previous = rows.slice(4, 8);
  if (latest.length < 4 || previous.length < 4) return null;
  const currentSum = latest.reduce(
    (sum, row) => sum + Number(row?.["每股稅後盈餘"]),
    0,
  );
  const previousSum = previous.reduce(
    (sum, row) => sum + Number(row?.["每股稅後盈餘"]),
    0,
  );
  const hasInvalid = [...latest, ...previous].some(
    (row) => !Number.isFinite(Number(row?.["每股稅後盈餘"])),
  );
  if (hasInvalid) return null;
  const ratio = safeDiv(currentSum - previousSum, Math.abs(previousSum));
  return ratio == null ? null : ratio * 100;
}

function quoteReturn(quotes, monthsBack) {
  const rows = sortAscByKey(quotes, "日期");
  const latest = rows[rows.length - 1];
  if (!latest?.["日期"]) return null;
  const target = new Date(`${latest["日期"]}T00:00:00Z`);
  target.setUTCMonth(target.getUTCMonth() - monthsBack);
  const targetDate = target.toISOString().slice(0, 10);
  const base = rows
    .filter((row) => String(row?.["日期"] ?? "") <= targetDate)
    .at(-1);
  const close = Number(latest?.["收盤價"]);
  const baseClose = Number(base?.["收盤價"]);
  const ratio = safeDiv(close - baseClose, Math.abs(baseClose));
  return ratio == null ? null : ratio * 100;
}

function signedPercent(value, label) {
  return `${signStr(value)}${formatPercent(value, 2, label)}`;
}

function countText(value) {
  return value == null ? "—" : formatNumber(value, 0);
}

function latestCashDividend(dividend) {
  const row = Array.isArray(dividend) ? dividend[0] : null;
  return Number(row?.["年度現金股利"]);
}

function card(label, valueHtml, subHtml = "") {
  return `
    <div class="info-card">
      <div class="card-label">${escapeHtml(label)}</div>
      <div class="card-value">${valueHtml}</div>
      ${subHtml ? `<div class="text-xs text-muted mt-2">${subHtml}</div>` : ""}
    </div>`;
}

export function renderStockSummary({
  profile,
  quotes,
  sales,
  income,
  dividend,
  ruleScore,
} = {}) {
  const container = document.getElementById("stock-summary-content");
  if (!container) return;

  const profileRow = Array.isArray(profile) ? profile[0] : profile;
  const quote = latestQuote(quotes);
  const close = Number(quote?.["收盤價"]);
  const pe = quote?.["本益比"];
  const pb = quote?.["股價淨值比"];
  const cashDividend = latestCashDividend(dividend);
  const dividendRatio =
    Number.isFinite(cashDividend) && Number.isFinite(close)
      ? safeDiv(cashDividend, close)
      : null;
  const dividendYield = dividendRatio == null ? null : dividendRatio * 100;
  const salesTtmYoy = computeTtmSalesYoy(sales);
  const epsTtmYoy = computeEpsTtmYoy(income);
  const oneMonth = quoteReturn(quotes, 1);
  const threeMonth = quoteReturn(quotes, 3);
  const scoreText = ruleScore?.score == null ? "—" : ruleScore.displayText;
  const quoteMove = quote
    ? `${formatNumber(close, 2, "收盤價")} ${signStr(quote["漲幅"])}${formatPercent(quote["漲幅"], 2, "漲幅")}`
    : "—";
  const safeName = escapeHtml(profileRow?.["股票名稱"] ?? "");

  container.innerHTML = `
    ${card(
      "規則評分",
      `<span class="score-card-large">${escapeHtml(scoreText)}</span>`,
      `警示 ${countText(ruleScore?.triggered)} / 可評估 ${countText(ruleScore?.available)} / 資料不足 ${countText(ruleScore?.na)}${safeName ? `<br>標的 ${safeName}` : ""}`,
    )}
    ${card(
      "估值風險",
      `PE ${formatNumber(pe, 1, "本益比")} / PB ${formatNumber(pb, 2, "股價淨值比")}`,
      `殖利率 ${formatPercent(dividendYield, 2, "現金殖利率")}`,
    )}
    ${card(
      "成長動能",
      `12M TTM YoY <span class="${valClassChange(salesTtmYoy)}">${signedPercent(salesTtmYoy, "12M TTM YoY")}</span>`,
      `EPS TTM YoY <span class="${valClassChange(epsTtmYoy)}">${signedPercent(epsTtmYoy, "EPS TTM YoY")}</span>`,
    )}
    ${card(
      "走勢風險",
      `<span class="${valClassChange(quote?.["漲幅"])}">${quoteMove}</span>`,
      `1M <span class="${valClassChange(oneMonth)}">${signedPercent(oneMonth, "1M 報酬")}</span> ｜ 3M <span class="${valClassChange(threeMonth)}">${signedPercent(threeMonth, "3M 報酬")}</span>`,
    )}
  `;
}
