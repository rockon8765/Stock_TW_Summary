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
  return value == null ? "—" : `${signStr(value)}${formatPercent(value, 2, label)}`;
}

function countText(value) {
  return value == null ? "—" : formatNumber(value, 0);
}

function finiteNumber(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function latestCashDividend(dividend) {
  const row = Array.isArray(dividend) ? dividend[0] : null;
  return Number(row?.["年度現金股利"]);
}

export function classifyValuation(pe) {
  const value = finiteNumber(pe);
  if (value == null) return { key: "unknown", text: "估值資料不足" };
  if (value < 0) {
    return {
      key: "loss",
      text: "PE 為負，代表近期獲利為負，暫不適合以 PE 判斷估值",
    };
  }
  if (value < 10) {
    return { key: "low", text: `估值偏低（PE ${formatNumber(value, 1, "PE")}）` };
  }
  if (value <= 20) {
    return { key: "fair", text: `估值合理（PE ${formatNumber(value, 1, "PE")}）` };
  }
  if (value <= 30) {
    return { key: "high", text: `估值偏高（PE ${formatNumber(value, 1, "PE")}）` };
  }
  return {
    key: "very_high",
    text: `估值明顯偏高（PE ${formatNumber(value, 1, "PE")}），需注意獲利成長能否支撐`,
  };
}

export function classifyGrowth(salesYoy, epsYoy) {
  const sales = finiteNumber(salesYoy);
  const eps = finiteNumber(epsYoy);
  if (sales == null || eps == null) {
    return { key: "unknown", text: "成長資料不足" };
  }
  if (sales >= 10 && eps >= 10) return { key: "strong", text: "成長動能強勁" };
  if (sales >= 0 && eps >= 0) return { key: "mild", text: "成長溫和" };
  if (sales >= 0 && eps < 0) {
    return { key: "sales_only", text: "營收成長但獲利承壓" };
  }
  if (sales < 0 && eps >= 0) {
    return { key: "eps_only", text: "營收衰退但獲利改善" };
  }
  return { key: "weak", text: "營收與獲利同步承壓" };
}

export function classifyMomentum(threeMonth) {
  const value = finiteNumber(threeMonth);
  if (value == null) return null;
  if (value >= 10) return { key: "strong", verb: "上漲", extension: "動能強勁" };
  if (value >= 5) return { key: "up", verb: "上漲", extension: "動能延續中" };
  if (value >= 0) return { key: "stable", verb: "微幅上漲", extension: "走勢偏穩" };
  if (value >= -5) return { key: "soft", verb: "微幅下跌", extension: "走勢偏弱" };
  return { key: "weak", verb: "下跌", extension: "走勢承壓" };
}

export function classifyDividend(dividendYield) {
  const value = finiteNumber(dividendYield);
  if (value == null || value <= 0) {
    return { key: "unknown", text: "目前無現金配息資料" };
  }
  const display = formatPercent(value, 2, "現金殖利率");
  if (value < 1) return { key: "low", text: `現金殖利率 ${display}，偏低` };
  if (value <= 3) {
    return { key: "fair", text: `現金殖利率 ${display}，屬中性水準` };
  }
  if (value <= 5) {
    return { key: "attractive", text: `現金殖利率 ${display}，具配息吸引力` };
  }
  return {
    key: "high",
    text: `現金殖利率 ${display}，偏高（須留意配息穩定性）`,
  };
}

export function joinValuationGrowth(valKey, growthKey) {
  if (valKey === "loss") return "";
  if (valKey === "unknown" || growthKey === "unknown") return "，";
  if (["high", "very_high"].includes(valKey)) {
    return growthKey === "strong" ? "但" : "且";
  }
  if (valKey === "fair") return growthKey === "strong" ? "，且" : "，但";
  if (valKey === "low") return growthKey === "weak" ? "，但" : "，且";
  return "，";
}

function joinWithConnector(left, connector, right) {
  const bridge = connector.startsWith("，") ? connector : `，${connector}`;
  return `${left}${bridge}${right}`;
}

export function buildNarrative({
  name,
  ticker,
  valuation,
  growth,
  momentum,
  dividend,
  salesYoy,
  epsYoy,
  threeM,
} = {}) {
  const label = `${name || "此標的"}${ticker ? `（${ticker}）` : ""}`;
  const valuationText = valuation?.text ?? "估值資料不足";
  const growthText = growth?.text ?? "成長資料不足";
  const valuationGrowth =
    valuation?.key === "loss"
      ? `${valuationText}；${growthText}`
      : joinWithConnector(
          valuationText,
          joinValuationGrowth(valuation?.key, growth?.key),
          growthText,
        );
  const details =
    growth?.key === "unknown"
      ? ""
      : `——近 12 個月 TTM 營收年增 ${signedPercent(
          salesYoy,
          "TTM 營收 YoY",
        )}，EPS 年增 ${signedPercent(epsYoy, "EPS TTM YoY")}`;
  const momentumText = momentum
    ? `；近 3 個月股價${momentum.verb} ${signedPercent(
        threeM,
        "3M 報酬",
      )}，${momentum.extension}`
    : "";
  return `${label}目前${valuationGrowth}${details}${momentumText}。${
    dividend?.text ?? "目前無現金配息資料"
  }。`;
}

function chip(label, value, className = "val-neutral") {
  return `
    <span class="stock-summary-chip ${escapeHtml(className)}">
      ${escapeHtml(label)} ${escapeHtml(value)}
    </span>`;
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
  const name = profileRow?.["股票名稱"] ?? quote?.["股票名稱"] ?? "";
  const ticker = profileRow?.["股票代號"] ?? quote?.["股票代號"] ?? "";
  const valuation = classifyValuation(pe);
  const growth = classifyGrowth(salesTtmYoy, epsTtmYoy);
  const momentum = classifyMomentum(threeMonth);
  const dividendDescription = classifyDividend(dividendYield);
  const narrative = buildNarrative({
    name,
    ticker,
    valuation,
    growth,
    momentum,
    dividend: dividendDescription,
    salesYoy: salesTtmYoy,
    epsYoy: epsTtmYoy,
    threeM: threeMonth,
  });

  container.innerHTML = `
    <div class="stock-summary-header">
      <div class="stock-summary-score">
        <span class="score-card-large">${escapeHtml(scoreText)}</span>
        <span class="stock-summary-score-label">規則評分</span>
      </div>
      <div class="stock-summary-score-meta">
        警示 ${countText(ruleScore?.triggered)} / 可評估 ${countText(
          ruleScore?.available,
        )} / 資料不足 ${countText(ruleScore?.na)}
      </div>
    </div>
    <p class="stock-summary-narrative">${escapeHtml(narrative)}</p>
    <div class="stock-summary-chips">
      ${chip(
        "殖利率",
        dividendYield == null
          ? "—"
          : formatPercent(dividendYield, 2, "現金殖利率"),
      )}
      ${chip("1M", signedPercent(oneMonth, "1M 報酬"), valClassChange(oneMonth))}
      ${chip(
        "3M",
        signedPercent(threeMonth, "3M 報酬"),
        valClassChange(threeMonth),
      )}
      ${chip(
        "TTM YoY",
        signedPercent(salesTtmYoy, "TTM 營收 YoY"),
        valClassChange(salesTtmYoy),
      )}
    </div>
  `;
}
