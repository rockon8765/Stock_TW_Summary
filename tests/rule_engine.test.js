import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeBuyScore,
  computePeriodScores,
  computeRuleAlerts,
} from "../js/lib/rule_engine.js";

const RULE_CODES = ["S10", "S11", "S12", "S13", "S20", "S22", "S17"];

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

function findRule(result, code) {
  return result.rules.find((rule) => rule.code === code);
}

function makeMonthSalesRows(values = {}) {
  const months = [
    "202503",
    "202502",
    "202501",
    "202412",
    "202411",
    "202410",
    "202409",
    "202408",
  ];

  return months.map((month) => ({
    年月: month,
    累計合併營收成長: values[month]?.cum ?? 1,
    單月合併營收年成長: values[month]?.single ?? 1,
  }));
}

function makeQuarterRows(overrides = {}) {
  const quarters = [
    "202504",
    "202503",
    "202502",
    "202501",
    "202404",
    "202403",
    "202402",
    "202401",
    "202304",
    "202303",
    "202302",
    "202301",
    "202204",
    "202203",
  ];

  return quarters.map((quarter) => ({
    年季: quarter,
    稅後純益: overrides[quarter]?.net ?? 100,
    營業利益: overrides[quarter]?.op ?? 100,
  }));
}

function makeDailyRows(endDate, count, rowForIndex) {
  const end = new Date(`${endDate}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (count - 1 - index));
    const iso = date.toISOString().slice(0, 10);
    return makeQuoteRow(iso, rowForIndex(index, iso));
  });
}

test("computeRuleAlerts returns all seven live rule codes", () => {
  const result = computeRuleAlerts({});
  assert.deepEqual(
    result.rules.map((rule) => rule.code),
    RULE_CODES,
  );
  result.rules.forEach((rule) => {
    assert.equal(rule.periods.length, 6);
    assert.equal(typeof rule.frequency, "string");
    assert.equal(rule.latest, rule.periods[5]);
    assert.equal(rule.triggered, false);
    assert.equal(rule.latest.triggered, null);
  });
  assert.equal(result.alertCount, 0);
  assert.equal(result.latestAlertCount, 0);
  assert.equal(result.latestAvailableCount, 0);
  assert.equal(result.latestNaCount, 7);
});

test("S20 and S22 labels explain live semantics instead of implying the old snapshot rules", () => {
  const result = computeRuleAlerts({});
  const s20 = result.rules.find((rule) => rule.code === "S20");
  const s22 = result.rules.find((rule) => rule.code === "S22");

  assert.match(s20.name, /單月/);
  assert.match(s22.name, /近似|Alpha250D/);
  assert.match(s22.detail, /ScoreCard|Alpha250D/);
});

test("S10 and S20 trigger from recent monthsales declines", () => {
  const result = computeRuleAlerts({
    monthsales: makeMonthSalesRows({
      202503: { cum: -11, single: -2 },
      202502: { cum: -13, single: -1 },
      202501: { cum: -12, single: 3 },
    }),
  });

  const states = ruleStates(result);
  assert.equal(states.S10, true);
  assert.equal(states.S20, true);
  assert.equal(findRule(result, "S10").latest.triggered, true);
  assert.equal(findRule(result, "S20").latest.triggered, true);
  assert.equal(result.alertCount, 2);
});

test("S11, S12, and S13 trigger from quarterly deterioration", () => {
  const result = computeRuleAlerts({
    incomeQ: makeQuarterRows({
      202504: { net: 80, op: 90 },
      202503: { net: 85, op: 95 },
      202502: { net: 90, op: 100 },
      202501: { net: 95, op: 105 },
      202404: { net: 120, op: 130 },
      202403: { net: 110, op: 120 },
      202402: { net: 108, op: 118 },
      202401: { net: 107, op: 117 },
    }),
  });

  const states = ruleStates(result);
  assert.equal(states.S11, true);
  assert.equal(states.S12, true);
  assert.equal(states.S13, true);
  assert.equal(findRule(result, "S11").latest.triggered, true);
  assert.equal(findRule(result, "S12").latest.triggered, true);
  assert.equal(findRule(result, "S13").latest.triggered, true);
});

test("S17 triggers when latest PB is above the 80th percentile", () => {
  const quotes = makeDailyRows("2025-12-31", 260, (index) => ({
    股價淨值比: index + 1,
  }));

  const result = computeRuleAlerts({ quotes });
  assert.equal(findRule(result, "S17").latest.triggered, true);
});

test("S17 month-end snapshots expose the actual cutoff trading day", () => {
  const quotes = makeDailyRows("2026-04-28", 260, (index) => ({
    股價淨值比: index + 1,
  }));

  const result = computeRuleAlerts({ quotes });
  const s17 = findRule(result, "S17");

  assert.equal(s17.periods[5].label, "2026-04");
  assert.match(s17.periods[5].detail, /^cutoff 2026-04-28;/);
  assert.equal(s17.periods[4].label, "2026-03");
  assert.match(s17.periods[4].detail, /^cutoff 2026-03-31;/);
});

test("S22 triggers when the latest close is below the 250-day average and alpha is weak", () => {
  const quotes = makeDailyRows("2025-12-31", 260, (index) => ({
    收盤價: index === 259 ? 100 : 200,
    股價淨值比: 1.5,
  }));

  const stats = [makeStatsRow("2025-12-31", { Alpha250D: -0.2 })];

  const result = computeRuleAlerts({ quotes, stats });
  assert.equal(findRule(result, "S22").latest.triggered, true);
});

test("S22 falls back to the most recent stats row before the cutoff date", () => {
  const quotes = makeDailyRows("2026-04-30", 260, (index) => ({
    收盤價: index === 259 ? 100 : 200,
    股價淨值比: 1.5,
  }));
  const stats = [makeStatsRow("2026-04-29", { Alpha250D: -0.2 })];

  const result = computeRuleAlerts({ quotes, stats });
  const s22 = findRule(result, "S22");

  assert.equal(s22.latest.triggered, true);
  assert.match(s22.latest.detail, /^cutoff 2026-04-30;/);
});

test("monthly rules return 6 oldest-first periods with month labels", () => {
  const result = computeRuleAlerts({
    monthsales: makeMonthSalesRows(),
  });

  assert.deepEqual(
    findRule(result, "S10").periods.map((period) => period.label),
    ["2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03"],
  );
});

test("quarterly oldest period is N/A when YOY lookback is insufficient", () => {
  const result = computeRuleAlerts({
    incomeQ: makeQuarterRows().slice(0, 10),
  });

  const s11 = findRule(result, "S11");
  assert.equal(s11.periods[0].label, "2024Q3");
  assert.equal(s11.periods[0].triggered, null);
});

test("S13 YTD must not include same-year quarters after the anchor", () => {
  const result = computeRuleAlerts({
    incomeQ: makeQuarterRows({
      202504: { net: 10000, op: 100 },
      202503: { net: 80, op: 100 },
      202502: { net: 80, op: 100 },
      202501: { net: 80, op: 100 },
      202404: { net: 100, op: 100 },
      202403: { net: 100, op: 100 },
      202402: { net: 100, op: 100 },
      202401: { net: 100, op: 100 },
    }),
  });

  const s13 = findRule(result, "S13");
  assert.equal(s13.periods[4].label, "2025Q3");
  assert.equal(s13.periods[4].triggered, true);
});

test("alertCount reflects only latest period triggered count", () => {
  const result = computeRuleAlerts({
    monthsales: makeMonthSalesRows({
      202503: { cum: -5, single: 5 },
      202502: { cum: -12, single: 5 },
      202501: { cum: -12, single: 5 },
      202412: { cum: -12, single: 5 },
    }),
  });

  const s10 = findRule(result, "S10");
  assert.equal(s10.periods[4].triggered, true);
  assert.equal(s10.latest.triggered, false);
  assert.equal(result.alertCount, 0);
  assert.equal(result.latestAlertCount, 0);
});

test("latestAvailableCount and latestNaCount partition the seven rules", () => {
  const result = computeRuleAlerts({
    monthsales: makeMonthSalesRows({
      202503: { cum: -11, single: 5 },
      202502: { cum: -13, single: 5 },
      202501: { cum: -12, single: 5 },
    }),
  });

  assert.equal(result.latestAlertCount, 1);
  assert.equal(result.latestAvailableCount, 2);
  assert.equal(result.latestNaCount, 5);
  assert.equal(result.latestAvailableCount + result.latestNaCount, 7);
  assert.ok(result.latestAlertCount <= result.latestAvailableCount);
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
  assert.equal(result.latestAlertCount, 0);
  assert.equal(result.latestAvailableCount, 0);
  assert.equal(result.latestNaCount, 7);
  result.rules.forEach((rule) => {
    assert.equal(rule.triggered, false);
    assert.equal(rule.latest.triggered, null);
    rule.periods.forEach((period) => assert.equal(period.triggered, null));
  });
});

test("computeBuyScore uses NA-fair reverse scoring for sell-rule alerts", () => {
  assert.deepEqual(computeBuyScore(7, 0), {
    score: 10,
    displayText: "10.0",
    available: 7,
    triggered: 0,
    na: 0,
  });
  assert.equal(computeBuyScore(7, 3).score.toFixed(2), "5.71");
  assert.equal(computeBuyScore(5, 2).score, 6);
  assert.equal(computeBuyScore(0, 0).score, null);
  assert.equal(computeBuyScore(5, 9).score, 0);
});

test("computePeriodScores maps six rule periods to month-end score points", () => {
  const monthlyLabels = [
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
  ];
  const ruleResult = {
    rules: [
      {
        code: "S10",
        periods: monthlyLabels.map((label, index) => ({
          label,
          triggered: index === 0 ? null : index === 5,
          detail: "",
        })),
      },
      {
        code: "S11",
        periods: ["2024Q3", "2024Q3", "2024Q4", "2024Q4", "2025Q1", "2025Q1"].map(
          (label, index) => ({
            label,
            triggered: index === 0 ? null : false,
            detail: "",
          }),
        ),
      },
      {
        code: "S22",
        periods: monthlyLabels.map((label, index) => ({
          label,
          triggered: index === 0 ? null : index === 4,
          detail: `cutoff ${label}-28; close 100`,
        })),
      },
    ],
  };

  const scores = computePeriodScores(ruleResult);

  assert.equal(scores.length, 6);
  assert.deepEqual(
    scores.map((score) => score.label),
    monthlyLabels,
  );
  assert.equal(scores[0].score, null);
  assert.equal(scores[0].available, 0);
  assert.equal(scores[4].date, "2026-02-28");
  assert.equal(scores[4].available, 3);
  assert.equal(scores[4].triggered, 1);
  assert.equal(scores[4].score.toFixed(2), "6.67");
  assert.equal(scores[5].date, "2026-03-28");
  assert.equal(scores[5].triggered, 1);
});
