import {
  escapeHtml,
  formatNumber,
  formatPercent,
  safeDiv,
  signStr,
  sortAscByKey,
  valClassChange,
} from "../utils.js";

let chart = null;
let candleSeries = null;
let volumeSeries = null;
let scoreOverlaySeries = null;
let allData = [];
let pendingScoreOverlay = [];
let resizeObserver = null;
let crosshairHandler = null;
let clickHandler = null;

function getRangeButtons() {
  return document.querySelectorAll("#kline-range-btns .range-btn");
}

function syncActiveRangeButton(activeRange) {
  const buttons = getRangeButtons();
  buttons.forEach((button) => {
    button.classList.remove("range-btn-active");
    if (button.dataset.range === activeRange) {
      button.classList.add("range-btn-active");
    }
  });
}

export function renderKline(data) {
  const container = document.getElementById("kline-chart");

  // Cleanup previous chart + observer to avoid leaks on re-render / ticker switch
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (chart) {
    if (crosshairHandler && chart.unsubscribeCrosshairMove) {
      chart.unsubscribeCrosshairMove(crosshairHandler);
      crosshairHandler = null;
    }
    if (clickHandler && chart.unsubscribeClick) {
      chart.unsubscribeClick(clickHandler);
      clickHandler = null;
    }
    chart.remove();
    chart = null;
  }
  scoreOverlaySeries = null;

  container.innerHTML = "";
  const getChartHeight = () => container.clientHeight || 360;

  // Sort by date ascending
  allData = sortAscByKey(data, "日期");

  // Create chart
  chart = LightweightCharts.createChart(container, {
    layout: {
      background: { color: "#1e293b" },
      textColor: "#94a3b8",
    },
    grid: {
      vertLines: { color: "#334155" },
      horzLines: { color: "#334155" },
    },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: "#475569" },
    timeScale: {
      borderColor: "#475569",
      timeVisible: false,
    },
    width: container.clientWidth,
    height: getChartHeight(),
  });

  // Candlestick series (v4 compatible: try new API first, fallback to legacy)
  const candleOpts = {
    upColor: "#ef4444",
    downColor: "#22c55e",
    borderUpColor: "#ef4444",
    borderDownColor: "#22c55e",
    wickUpColor: "#ef4444",
    wickDownColor: "#22c55e",
  };
  if (LightweightCharts.CandlestickSeries) {
    candleSeries = chart.addSeries(
      LightweightCharts.CandlestickSeries,
      candleOpts,
    );
  } else {
    candleSeries = chart.addCandlestickSeries(candleOpts);
  }

  // Volume series
  const histOpts = {
    priceFormat: { type: "volume" },
    priceScaleId: "volume",
  };
  if (LightweightCharts.HistogramSeries) {
    volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, histOpts);
  } else {
    volumeSeries = chart.addHistogramSeries(histOpts);
  }
  chart.priceScale("volume").applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 },
  });
  ensureScoreSeries();
  applyScoreOverlayData(pendingScoreOverlay);

  setRange("5Y");
  bindRangeButtons();
  const tooltipEl = createTooltipEl(container);
  crosshairHandler = (param) => handleTooltipMove(param, tooltipEl, container);
  clickHandler = (param) => handleTooltipMove(param, tooltipEl, container);
  chart.subscribeCrosshairMove(crosshairHandler);
  if (chart.subscribeClick) chart.subscribeClick(clickHandler);

  // Responsive — store in module-level var so next render can disconnect
  resizeObserver = new ResizeObserver(() => {
    chart.resize(container.clientWidth, getChartHeight());
  });
  resizeObserver.observe(container);
}

function ensureScoreSeries() {
  if (!chart || scoreOverlaySeries) return;
  const lineOptions = {
    color: "#fbbf24",
    lineWidth: 2,
    priceScaleId: "score",
    priceFormat: { type: "price", precision: 1, minMove: 0.1 },
  };
  if (LightweightCharts.LineSeries) {
    scoreOverlaySeries = chart.addSeries(
      LightweightCharts.LineSeries,
      lineOptions,
    );
  } else if (chart.addLineSeries) {
    scoreOverlaySeries = chart.addLineSeries(lineOptions);
  }
  if (!scoreOverlaySeries) return;
  chart.priceScale("score").applyOptions({
    scaleMargins: { top: 0.1, bottom: 0.7 },
    mode: 1,
  });
}

function applyScoreOverlayData(periodScores = []) {
  pendingScoreOverlay = Array.isArray(periodScores) ? periodScores : [];
  if (!scoreOverlaySeries) return;
  const data = pendingScoreOverlay
    .filter((point) => point?.score != null && point?.date)
    .map((point) => ({ time: point.date, value: point.score }));
  scoreOverlaySeries.setData(data);
}

export function setRuleScoreOverlay(periodScores) {
  ensureScoreSeries();
  applyScoreOverlayData(periodScores);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function displayNumber(value, decimals, fieldName) {
  return value == null ? "—" : formatNumber(value, decimals, fieldName);
}

function displaySignedNumber(value, decimals, fieldName) {
  return value == null
    ? "—"
    : `${signStr(value)}${formatNumber(value, decimals, fieldName)}`;
}

function displaySignedPercent(value, decimals, fieldName) {
  return value == null
    ? "—"
    : `${signStr(value)}${formatPercent(value, decimals, fieldName)}`;
}

function resolveShareVolume(row) {
  const shareVolume = finiteNumber(row?.["成交量_股"]);
  if (shareVolume != null) return shareVolume;

  // Dottdot `成交量` is board-lot volume; chart volume should use shares.
  const lotVolume = finiteNumber(row?.["成交量"]);
  return lotVolume == null ? 0 : lotVolume * 1000;
}

export function timeToDateKey(time) {
  if (typeof time === "string") return time.slice(0, 10);
  if (typeof time === "number" && Number.isFinite(time)) {
    const milliseconds = time > 1e12 ? time : time * 1000;
    return new Date(milliseconds).toISOString().slice(0, 10);
  }
  if (
    time &&
    typeof time === "object" &&
    Number.isFinite(Number(time.year)) &&
    Number.isFinite(Number(time.month)) &&
    Number.isFinite(Number(time.day))
  ) {
    const year = String(Number(time.year)).padStart(4, "0");
    const month = String(Number(time.month)).padStart(2, "0");
    const day = String(Number(time.day)).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return "";
}

export function findPrevClose(rows, dateKey) {
  if (!Array.isArray(rows) || !dateKey) return null;
  const sortedRows = sortAscByKey(rows, "日期");
  const index = sortedRows.findIndex((row) => row?.["日期"] === dateKey);
  if (index <= 0) return null;
  return finiteNumber(sortedRows[index - 1]?.["收盤價"]);
}

export function formatVolumeForTooltip(shares) {
  const value = finiteNumber(shares);
  if (value == null || value <= 0) return { lots: "—", shares: "—" };
  if (value < 1000) {
    return {
      lots: "<1",
      shares: formatNumber(value, 0, "成交量_股"),
    };
  }
  return {
    lots: formatNumber(value / 1000, 2, "成交量_張"),
    shares: formatNumber(value, 0, "成交量_股"),
  };
}

export function buildTooltipPayload({
  date,
  ohlc,
  prevClose,
  volumeShares,
  score,
} = {}) {
  const open = finiteNumber(ohlc?.open);
  const high = finiteNumber(ohlc?.high);
  const low = finiteNumber(ohlc?.low);
  const close = finiteNumber(ohlc?.close);
  const previous = finiteNumber(prevClose);
  const change =
    close != null && previous != null ? close - previous : null;
  const changeRatio =
    change != null && previous != null
      ? safeDiv(change, Math.abs(previous))
      : null;
  return {
    date,
    open,
    high,
    low,
    close,
    change,
    changePct: changeRatio == null ? null : changeRatio * 100,
    changeClass: valClassChange(change),
    volume: formatVolumeForTooltip(volumeShares),
    score: finiteNumber(score),
  };
}

function tooltipRow(label, valueHtml, valueClass = "") {
  return `
    <div class="kline-tooltip-row">
      <span class="kline-tooltip-label">${escapeHtml(label)}</span>
      <span class="${escapeHtml(valueClass)}">${valueHtml}</span>
    </div>`;
}

export function renderTooltipHtml(payload = {}) {
  const closeText = `${escapeHtml(
    displayNumber(payload.close, 2, "收盤價"),
  )} <span class="${escapeHtml(payload.changeClass ?? "val-neutral")}">${escapeHtml(
    displaySignedNumber(payload.change, 2, "漲跌"),
  )} (${escapeHtml(displaySignedPercent(payload.changePct, 2, "漲跌幅"))})</span>`;
  const volumeText =
    payload.volume?.lots === "—"
      ? "—"
      : `${escapeHtml(payload.volume?.lots)} 張 (${escapeHtml(
          payload.volume?.shares,
        )} 股)`;
  const scoreRow =
    payload.score == null
      ? ""
      : tooltipRow(
          "規則評分",
          escapeHtml(displayNumber(payload.score, 1, "規則評分")),
        );

  return `
    <div class="kline-tooltip-date">${escapeHtml(payload.date ?? "—")}</div>
    ${tooltipRow("開", escapeHtml(displayNumber(payload.open, 2, "開盤價")))}
    ${tooltipRow("高", escapeHtml(displayNumber(payload.high, 2, "最高價")))}
    ${tooltipRow("低", escapeHtml(displayNumber(payload.low, 2, "最低價")))}
    ${tooltipRow("收", closeText)}
    ${tooltipRow("量", volumeText)}
    ${scoreRow}
  `;
}

export function positionTooltipStyle(
  point,
  containerWidth,
  containerHeight,
  tooltipWidth,
  tooltipHeight,
) {
  const offset = 8;
  let left = point.x + offset;
  let top = point.y + offset;
  if (left + tooltipWidth > containerWidth) {
    left = point.x - tooltipWidth - offset;
  }
  if (top + tooltipHeight > containerHeight) {
    top = point.y - tooltipHeight - offset;
  }
  return {
    left: `${Math.max(offset, Math.round(left))}px`,
    top: `${Math.max(offset, Math.round(top))}px`,
  };
}

function createTooltipEl(container) {
  const existing = container.querySelector?.(".kline-tooltip");
  if (existing) existing.remove();
  const tooltip = document.createElement("div");
  tooltip.className = "kline-tooltip";
  container.appendChild(tooltip);
  return tooltip;
}

function hideTooltip(tooltipEl) {
  tooltipEl.style.display = "none";
}

function handleTooltipMove(param, tooltipEl, container) {
  if (
    !param?.point ||
    !param.time ||
    param.point.x < 0 ||
    param.point.x > container.clientWidth ||
    param.point.y < 0 ||
    param.point.y > container.clientHeight
  ) {
    hideTooltip(tooltipEl);
    return;
  }
  const candleData = param.seriesData?.get(candleSeries);
  if (!candleData) {
    hideTooltip(tooltipEl);
    return;
  }
  const dateKey = timeToDateKey(param.time);
  if (!dateKey) {
    hideTooltip(tooltipEl);
    return;
  }
  const volumeData = param.seriesData?.get(volumeSeries);
  const scoreData = scoreOverlaySeries
    ? param.seriesData?.get(scoreOverlaySeries)
    : null;
  tooltipEl.innerHTML = renderTooltipHtml(
    buildTooltipPayload({
      date: dateKey,
      ohlc: candleData,
      prevClose: findPrevClose(allData, dateKey),
      volumeShares: volumeData?.value,
      score: scoreData?.value,
    }),
  );
  Object.assign(
    tooltipEl.style,
    positionTooltipStyle(
      param.point,
      container.clientWidth,
      container.clientHeight,
      tooltipEl.offsetWidth || 180,
      tooltipEl.offsetHeight || 120,
    ),
  );
  tooltipEl.style.display = "block";
}

function setRange(range) {
  if (!allData.length) return;
  syncActiveRangeButton(range);

  const now = new Date(allData[allData.length - 1]["日期"]);
  let from = new Date(now);

  switch (range) {
    case "3M":
      from.setMonth(from.getMonth() - 3);
      break;
    case "6M":
      from.setMonth(from.getMonth() - 6);
      break;
    case "1Y":
      from.setFullYear(from.getFullYear() - 1);
      break;
    case "3Y":
      from.setFullYear(from.getFullYear() - 3);
      break;
    case "5Y":
      from.setFullYear(from.getFullYear() - 5);
      break;
  }

  const fromStr = from.toISOString().slice(0, 10);
  const filtered = allData.filter((d) => d["日期"] >= fromStr);

  const candles = filtered.map((d) => ({
    time: d["日期"],
    open: d["開盤價"],
    high: d["最高價"],
    low: d["最低價"],
    close: d["收盤價"],
  }));

  const volumes = filtered.map((d) => ({
    time: d["日期"],
    value: resolveShareVolume(d),
    color:
      d["收盤價"] >= d["開盤價"]
        ? "rgba(239,68,68,0.4)"
        : "rgba(34,197,94,0.4)",
  }));

  candleSeries.setData(candles);
  volumeSeries.setData(volumes);
  chart.timeScale().fitContent();
}

function bindRangeButtons() {
  const btns = getRangeButtons();
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      setRange(btn.dataset.range);
    });
  });
}
