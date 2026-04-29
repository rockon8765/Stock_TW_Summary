import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getStrategyDataState,
  loadStrategyData,
  parseCSV,
  renderStrategy,
  resetStrategyDataStateForTests,
  setStrategyDataStateForTests,
} from "../js/modules/strategy.js";

function withMockContainers(fn) {
  const elements = {
    "strategy-holding-container": { innerHTML: "" },
    "strategy-trade-container": { innerHTML: "" },
  };
  const originalDocument = global.document;
  global.document = {
    getElementById(id) {
      return elements[id] ?? null;
    },
  };

  try {
    fn(elements);
  } finally {
    global.document = originalDocument;
  }
}

function csvResponse(text, ok = true) {
  return {
    ok,
    async text() {
      return text;
    },
  };
}

test("parseCSV keeps quoted commas inside a single field", () => {
  const rows = parseCSV(
    '策略名稱,股票代號,平均報酬率\n"Alpha, Beta",2330,0.12\n',
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0]["策略名稱"], "Alpha, Beta");
});

test("loadStrategyData records a failed state when csv fetches fail", async () => {
  resetStrategyDataStateForTests();

  await loadStrategyData({
    baseUrl: "/mock",
    fetchImpl: async () => csvResponse("", false),
  });

  const state = getStrategyDataState();
  assert.equal(state.status, "failed");
  assert.deepEqual(state.holdingData, []);
  assert.deepEqual(state.tradeData, []);
});

test("loadStrategyData records a loaded state when csv fetches succeed", async () => {
  resetStrategyDataStateForTests();

  await loadStrategyData({
    baseUrl: "/mock",
    fetchImpl: async (url) =>
      url.includes("holding")
        ? csvResponse("股票代號,策略名稱\n2330,長期持有\n")
        : csvResponse("股票代號,策略名稱\n2330,波段交易\n"),
  });

  const state = getStrategyDataState();
  assert.equal(state.status, "loaded");
  assert.equal(state.holdingData[0]["策略名稱"], "長期持有");
  assert.equal(state.tradeData[0]["策略名稱"], "波段交易");
});

test("renderStrategy distinguishes pending, failed, and loaded-empty states", () => {
  withMockContainers((elements) => {
    setStrategyDataStateForTests({
      status: "pending",
      holdingData: [],
      tradeData: [],
    });
    renderStrategy("2330");
    assert.match(
      elements["strategy-holding-container"].innerHTML,
      /策略資料載入中/,
    );

    setStrategyDataStateForTests({
      status: "failed",
      holdingData: [],
      tradeData: [],
    });
    renderStrategy("2330");
    assert.match(
      elements["strategy-holding-container"].innerHTML,
      /策略資料載入失敗/,
    );

    setStrategyDataStateForTests({
      status: "loaded",
      holdingData: [{ 股票代號: "2317", 策略名稱: "持有", 平均報酬率: "0.1" }],
      tradeData: [{ 股票代號: "2317", 策略名稱: "交易", 平均報酬率: "0.1" }],
    });
    renderStrategy("2330");
    assert.match(
      elements["strategy-holding-container"].innerHTML,
      /此股票無策略資料/,
    );
    assert.doesNotMatch(
      elements["strategy-holding-container"].innerHTML,
      /section-error/,
    );
  });
});
