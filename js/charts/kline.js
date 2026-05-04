import { sortAscByKey } from "../utils.js";

let chart = null;
let candleSeries = null;
let volumeSeries = null;
let scoreOverlaySeries = null;
let allData = [];
let pendingScoreOverlay = [];
let resizeObserver = null;

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
    value: d["成交量"] || 0,
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
