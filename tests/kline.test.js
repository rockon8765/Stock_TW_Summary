import test from "node:test";
import assert from "node:assert/strict";
import { renderKline } from "../js/charts/kline.js";

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
    classList: makeClassList(active ? ["range-btn", "range-btn-active"] : ["range-btn"]),
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
  };
  const chartApi = {
    addSeries() {
      return {
        setData() {},
      };
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
  };

  const originalDocument = global.document;
  const originalResizeObserver = global.ResizeObserver;
  const originalLightweightCharts = global.LightweightCharts;

  global.document = {
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
    CrosshairMode: { Normal: 0 },
    createChart() {
      return chartApi;
    },
  };

  return {
    buttons,
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

test("renderKline resets active range button back to 5Y on ticker rerender", () => {
  const ctx = installKlineTestGlobals();

  try {
    renderKline(sampleQuotes());
    const button3M = ctx.buttons.find((button) => button.dataset.range === "3M");
    const button5Y = ctx.buttons.find((button) => button.dataset.range === "5Y");

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
