import test from "node:test";
import assert from "node:assert/strict";
import { renderKline, setRuleScoreOverlay } from "../js/charts/kline.js";

function makeClassList(initial = []) {
  const classes = new Set(initial);
  return {
    add(name) {
      classes.add(name);
    },
    remove(name) {
      classes.delete(name);
    },
    contains(name) {
      return classes.has(name);
    },
  };
}

function makeRangeButton(range, active = false) {
  return {
    dataset: { range },
    classList: makeClassList(
      active ? ["range-btn", "range-btn-active"] : ["range-btn"],
    ),
    _listeners: new Map(),
    addEventListener(type, listener) {
      this._listeners.set(type, listener);
    },
    click() {
      this._listeners.get("click")?.();
    },
  };
}

function installKlineTestGlobals() {
  const addedSeries = [];
  const crosshairHandlers = [];
  const clickHandlers = [];
  const unsubscribeCalls = [];
  const buttons = [
    makeRangeButton("3M"),
    makeRangeButton("6M"),
    makeRangeButton("1Y"),
    makeRangeButton("3Y"),
    makeRangeButton("5Y", true),
  ];
  const container = {
    innerHTML: "",
    clientWidth: 960,
    clientHeight: 420,
    children: [],
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    querySelector(selector) {
      if (selector !== ".kline-tooltip") return null;
      return (
        this.children.find((child) => child.className === "kline-tooltip") ??
        null
      );
    },
  };
  const chartApi = {
    addSeries(type, options) {
      const series = {
        type,
        options,
        data: null,
        setData(data) {
          this.data = data;
        },
      };
      addedSeries.push(series);
      return series;
    },
    addCandlestickSeries() {
      return {
        setData() {},
      };
    },
    addHistogramSeries() {
      return {
        setData() {},
      };
    },
    priceScale() {
      return {
        applyOptions() {},
      };
    },
    timeScale() {
      return {
        fitContent() {},
      };
    },
    resize() {},
    remove() {},
    subscribeCrosshairMove(listener) {
      crosshairHandlers.push(listener);
    },
    unsubscribeCrosshairMove(listener) {
      unsubscribeCalls.push({ type: "crosshair", listener });
    },
    subscribeClick(listener) {
      clickHandlers.push(listener);
    },
    unsubscribeClick(listener) {
      unsubscribeCalls.push({ type: "click", listener });
    },
  };

  const originalDocument = global.document;
  const originalResizeObserver = global.ResizeObserver;
  const originalLightweightCharts = global.LightweightCharts;

  global.document = {
    createElement(tagName) {
      return {
        tagName: tagName.toUpperCase(),
        className: "",
        innerHTML: "",
        style: {},
        parentNode: null,
        remove() {
          if (!this.parentNode) return;
          this.parentNode.children = this.parentNode.children.filter(
            (child) => child !== this,
          );
          this.parentNode = null;
        },
      };
    },
    getElementById(id) {
      if (id === "kline-chart") return container;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "#kline-range-btns .range-btn") return buttons;
      return [];
    },
  };
  global.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    disconnect() {}
  };
  global.LightweightCharts = {
    CandlestickSeries: "CandlestickSeries",
    CrosshairMode: { Normal: 0 },
    HistogramSeries: "HistogramSeries",
    LineSeries: "LineSeries",
    createChart() {
      return chartApi;
    },
  };

  return {
    addedSeries,
    buttons,
    clickHandlers,
    container,
    crosshairHandlers,
    unsubscribeCalls,
    restore() {
      global.document = originalDocument;
      global.ResizeObserver = originalResizeObserver;
      global.LightweightCharts = originalLightweightCharts;
    },
  };
}

function sampleQuotes() {
  return [
    {
      日期: "2025-01-02",
      開盤價: 100,
      最高價: 110,
      最低價: 95,
      收盤價: 105,
      成交量: 1000,
      成交量_股: 1000123,
    },
    {
      日期: "2026-04-16",
      開盤價: 105,
      最高價: 112,
      最低價: 101,
      收盤價: 108,
      成交量: 1200,
    },
  ];
}

test("renderKline uses share-volume values for the volume histogram", () => {
  const ctx = installKlineTestGlobals();

  try {
    renderKline(sampleQuotes());

    const volumeSeries = ctx.addedSeries.find(
      (series) => series.type === "HistogramSeries",
    );
    assert.ok(volumeSeries);
    assert.deepEqual(
      volumeSeries.data.map(({ time, value }) => ({ time, value })),
      [
        { time: "2025-01-02", value: 1000123 },
        { time: "2026-04-16", value: 1200000 },
      ],
    );
  } finally {
    ctx.restore();
  }
});

test("kline tooltip helpers normalize time, previous close, volume, and HTML safely", async () => {
  const mod = await import("../js/charts/kline.js");
  assert.equal(typeof mod.timeToDateKey, "function");
  assert.equal(typeof mod.findPrevClose, "function");
  assert.equal(typeof mod.formatVolumeForTooltip, "function");
  assert.equal(typeof mod.buildTooltipPayload, "function");
  assert.equal(typeof mod.renderTooltipHtml, "function");
  assert.equal(typeof mod.positionTooltipStyle, "function");

  assert.equal(mod.timeToDateKey("2026-05-04"), "2026-05-04");
  assert.equal(
    mod.timeToDateKey({ year: 2026, month: 5, day: 4 }),
    "2026-05-04",
  );
  assert.equal(mod.timeToDateKey(1777852800), "2026-05-04");

  assert.equal(mod.findPrevClose(sampleQuotes(), "2025-01-02"), null);
  assert.equal(mod.findPrevClose(sampleQuotes(), "2026-04-16"), 105);
  assert.equal(mod.findPrevClose(sampleQuotes(), "2099-01-01"), null);

  assert.deepEqual(mod.formatVolumeForTooltip(null), {
    lots: "—",
    shares: "—",
  });
  assert.deepEqual(mod.formatVolumeForTooltip(999), {
    lots: "<1",
    shares: "999",
  });
  assert.deepEqual(mod.formatVolumeForTooltip(1500), {
    lots: "1.50",
    shares: "1,500",
  });
  assert.deepEqual(mod.formatVolumeForTooltip(18432000), {
    lots: "18,432.00",
    shares: "18,432,000",
  });

  const payload = mod.buildTooltipPayload({
    date: '<img src=x onerror="alert(1)">',
    ohlc: { open: 100, high: 110, low: 95, close: 105 },
    prevClose: 100,
    volumeShares: 18432000,
    score: 72,
  });
  assert.equal(payload.change, 5);
  assert.equal(payload.changePct, 5);

  const html = mod.renderTooltipHtml(payload);
  assert.match(html, /開/);
  assert.match(html, /高/);
  assert.match(html, /低/);
  assert.match(html, /收/);
  assert.match(html, /18,432\.00 張/);
  assert.match(html, /18,432,000 股/);
  assert.match(html, /警示分數/);
  assert.doesNotMatch(html, /規則評分/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x/);

  assert.deepEqual(
    mod.positionTooltipStyle({ x: 10, y: 10 }, 400, 300, 120, 80),
    { left: "18px", top: "18px" },
  );
  assert.deepEqual(
    mod.positionTooltipStyle({ x: 390, y: 290 }, 400, 300, 120, 80),
    { left: "262px", top: "202px" },
  );
});

test("renderKline subscribes tooltip handlers, renders OHLC tooltip, and cleans listeners", () => {
  const ctx = installKlineTestGlobals();

  try {
    renderKline(sampleQuotes());

    assert.equal(ctx.crosshairHandlers.length, 1);
    assert.equal(ctx.clickHandlers.length, 1);

    const candleSeries = ctx.addedSeries.find(
      (series) => series.type === "CandlestickSeries",
    );
    const volumeSeries = ctx.addedSeries.find(
      (series) => series.type === "HistogramSeries",
    );
    const scoreSeries = ctx.addedSeries.find(
      (series) => series.type === "LineSeries",
    );
    ctx.crosshairHandlers[0]({
      point: { x: 120, y: 80 },
      time: { year: 2026, month: 4, day: 16 },
      seriesData: new Map([
        [
          candleSeries,
          {
            open: 105,
            high: 112,
            low: 101,
            close: 108,
          },
        ],
        [volumeSeries, { value: 1200000 }],
        [scoreSeries, { value: 6.5 }],
      ]),
    });

    const tooltip = ctx.container.querySelector(".kline-tooltip");
    assert.ok(tooltip);
    assert.equal(tooltip.style.display, "block");
    assert.match(tooltip.innerHTML, /開/);
    assert.match(tooltip.innerHTML, /105\.00/);
    assert.match(tooltip.innerHTML, /高/);
    assert.match(tooltip.innerHTML, /112\.00/);
    assert.match(tooltip.innerHTML, /低/);
    assert.match(tooltip.innerHTML, /101\.00/);
    assert.match(tooltip.innerHTML, /收/);
    assert.match(tooltip.innerHTML, /108\.00/);
    assert.match(tooltip.innerHTML, /1,200\.00 張/);
    assert.match(tooltip.innerHTML, /1,200,000 股/);

    ctx.crosshairHandlers[0]({
      point: null,
      time: null,
      seriesData: new Map(),
    });
    assert.equal(tooltip.style.display, "none");

    renderKline(sampleQuotes());
    assert.ok(ctx.unsubscribeCalls.some((call) => call.type === "crosshair"));
    assert.ok(ctx.unsubscribeCalls.some((call) => call.type === "click"));
  } finally {
    ctx.restore();
  }
});

test("renderKline resets active range button back to 5Y on ticker rerender", () => {
  const ctx = installKlineTestGlobals();

  try {
    renderKline(sampleQuotes());
    const button3M = ctx.buttons.find(
      (button) => button.dataset.range === "3M",
    );
    const button5Y = ctx.buttons.find(
      (button) => button.dataset.range === "5Y",
    );

    button3M.click();
    assert.equal(button3M.classList.contains("range-btn-active"), true);
    assert.equal(button5Y.classList.contains("range-btn-active"), false);

    renderKline(sampleQuotes());

    assert.equal(button3M.classList.contains("range-btn-active"), false);
    assert.equal(button5Y.classList.contains("range-btn-active"), true);
  } finally {
    ctx.restore();
  }
});

test("setRange filters rule score overlay to the same window as candles (no time-axis stretch)", () => {
  const ctx = installKlineTestGlobals();

  try {
    renderKline(sampleQuotes());
    setRuleScoreOverlay([
      { date: "2021-06-30", score: 7 }, // 5Y ago — should be excluded by 3M
      { date: "2025-01-02", score: 5 }, // ~16 月前 — should be excluded by 3M
      { date: "2026-02-28", score: 4 }, // ~6 週前 — kept by 3M
      { date: "2026-03-31", score: 3 }, // 最近 — kept by 3M
    ]);

    const scoreSeries = ctx.addedSeries.find(
      (series) => series.type === "LineSeries",
    );
    assert.ok(scoreSeries, "score series exists");

    // 一開始預設 5Y → 全部 4 點
    assert.equal(scoreSeries.data.length, 4);

    // 切到 3M 範圍：「now」= 最末日 2026-04-16，3M 前 = 2026-01-16
    // 所以 2021/2025 的點要被濾掉，剩 2026-02-28 與 2026-03-31
    const button3M = ctx.buttons.find(
      (button) => button.dataset.range === "3M",
    );
    button3M.click();

    assert.deepEqual(scoreSeries.data, [
      { time: "2026-02-28", value: 4 },
      { time: "2026-03-31", value: 3 },
    ]);
  } finally {
    ctx.restore();
  }
});

test("setRuleScoreOverlay called AFTER user picked 3M still respects active range", () => {
  // 防回歸：避免「使用者已切 3M、overlay 資料晚到」造成時間軸再被 5Y 評分拉寬
  const ctx = installKlineTestGlobals();

  try {
    renderKline(sampleQuotes());
    // 1. 使用者先切 3M（此時 overlay 為空）
    const button3M = ctx.buttons.find(
      (button) => button.dataset.range === "3M",
    );
    button3M.click();

    // 2. 之後 overlay 資料才到（含 5Y 前的點）
    setRuleScoreOverlay([
      { date: "2021-06-30", score: 7 }, // 5Y 前
      { date: "2025-01-02", score: 5 }, // ~16 月前
      { date: "2026-02-28", score: 4 }, // 在 3M 視窗內
      { date: "2026-03-31", score: 3 }, // 在 3M 視窗內
    ]);

    // 期望：仍然只放 3M 視窗內的點，不會把舊的點塞進去
    const scoreSeries = ctx.addedSeries.find(
      (series) => series.type === "LineSeries",
    );
    assert.deepEqual(scoreSeries.data, [
      { time: "2026-02-28", value: 4 },
      { time: "2026-03-31", value: 3 },
    ]);
  } finally {
    ctx.restore();
  }
});

test("setRuleScoreOverlay renders non-null score points on an amber line series", () => {
  const ctx = installKlineTestGlobals();

  try {
    renderKline(sampleQuotes());
    setRuleScoreOverlay([
      { date: "2026-01-31", score: 8 },
      { date: "2026-02-28", score: null },
      { date: "2026-03-31", score: 6.5 },
    ]);

    const scoreSeries = ctx.addedSeries.find(
      (series) => series.type === "LineSeries",
    );
    assert.ok(scoreSeries);
    assert.equal(scoreSeries.options.priceScaleId, "score");
    assert.equal(scoreSeries.options.color, "#fbbf24");
    assert.deepEqual(scoreSeries.data, [
      { time: "2026-01-31", value: 8 },
      { time: "2026-03-31", value: 6.5 },
    ]);
  } finally {
    ctx.restore();
  }
});
