import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRuleAlerts } from "../js/lib/rule_engine.js";

function makeQuoteRow(date, overrides = {}) {
  return {
    日期: date,
    收盤價: 100,
    股價淨值比: 1.5,
    ...overrides,
  };
}

function makeStatsRow(date, overrides = {}) {
  return {
    日期: date,
    Alpha250D: 0.05,
    ...overrides,
  };
}

function ruleStates(result) {
  return Object.fromEntries(result.rules.map((rule) => [rule.code, rule.triggered]));
}

test("computeRuleAlerts returns all seven live rule codes", () => {
  const result = computeRuleAlerts({});
  assert.deepEqual(
    result.rules.map((rule) => rule.code),
    ["S10", "S11", "S12", "S13", "S20", "S22", "S17"],
  );
  assert.equal(result.alertCount, 0);
});

test("S10 and S20 trigger from recent monthsales declines", () => {
  const result = computeRuleAlerts({
    monthsales: [
      { 年月: "202503", 累計合併營收成長: -11, 單月合併營收年成長: -2 },
      { 年月: "202502", 累計合併營收成長: -13, 單月合併營收年成長: -1 },
      { 年月: "202501", 累計合併營收成長: -12, 單月合併營收年成長: 3 },
    ],
  });

  const states = ruleStates(result);
  assert.equal(states.S10, true);
  assert.equal(states.S20, true);
  assert.equal(result.alertCount, 2);
});

test("S11, S12, and S13 trigger from quarterly deterioration", () => {
  const result = computeRuleAlerts({
    incomeQ: [
      { 年季: "202504", 稅後純益: 80, 營業利益: 90 },
      { 年季: "202503", 稅後純益: 85, 營業利益: 95 },
      { 年季: "202502", 稅後純益: 90, 營業利益: 100 },
      { 年季: "202501", 稅後純益: 95, 營業利益: 105 },
      { 年季: "202404", 稅後純益: 120, 營業利益: 130 },
      { 年季: "202403", 稅後純益: 110, 營業利益: 120 },
      { 年季: "202402", 稅後純益: 108, 營業利益: 118 },
      { 年季: "202401", 稅後純益: 107, 營業利益: 117 },
    ],
  });

  const states = ruleStates(result);
  assert.equal(states.S11, true);
  assert.equal(states.S12, true);
  assert.equal(states.S13, true);
});

test("S17 triggers when latest PB is above the 80th percentile", () => {
  const quotes = Array.from({ length: 260 }, (_, index) =>
    makeQuoteRow(`2025-01-${String((index % 28) + 1).padStart(2, "0")}`, {
      股價淨值比: index + 1,
    }),
  );
  quotes[quotes.length - 1].日期 = "2025-12-31";

  const result = computeRuleAlerts({ quotes });
  assert.equal(ruleStates(result).S17, true);
});

test("S22 triggers when the latest close is below the 250-day average and alpha is weak", () => {
  const quotes = Array.from({ length: 250 }, (_, index) =>
    makeQuoteRow(`2025-01-${String((index % 28) + 1).padStart(2, "0")}`, {
      收盤價: index === 249 ? 100 : 200,
      股價淨值比: 1.5,
    }),
  );
  quotes[quotes.length - 1].日期 = "2025-12-31";

  const stats = [makeStatsRow("2025-12-31", { Alpha250D: -0.2 })];

  const result = computeRuleAlerts({ quotes, stats });
  assert.equal(ruleStates(result).S22, true);
});

test("rules stay off when data is insufficient", () => {
  const result = computeRuleAlerts({
    monthsales: [{ 年月: "202503", 累計合併營收成長: -12, 單月合併營收年成長: -1 }],
    incomeQ: [{ 年季: "202504", 稅後純益: 80, 營業利益: 90 }],
    quotes: [makeQuoteRow("2025-12-31")],
    stats: [makeStatsRow("2025-12-31", { Alpha250D: -0.2 })],
  });

  assert.deepEqual(ruleStates(result), {
    S10: false,
    S11: false,
    S12: false,
    S13: false,
    S20: false,
    S22: false,
    S17: false,
  });
  assert.equal(result.alertCount, 0);
});
