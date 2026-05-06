import { test } from "node:test";
import assert from "node:assert/strict";
import * as stockSummary from "../js/modules/stock_summary.js";

function withMockElement(id, fn) {
  const element = { innerHTML: "" };
  const originalDocument = global.document;
  global.document = {
    getElementById(targetId) {
      return targetId === id ? element : null;
    },
  };

  try {
    fn(element);
  } finally {
    global.document = originalDocument;
  }
}

function makeSalesRows() {
  const months = [
    "202603",
    "202602",
    "202601",
    "202512",
    "202511",
    "202510",
    "202509",
    "202508",
    "202507",
    "202506",
    "202505",
    "202504",
    "202503",
    "202502",
    "202501",
    "202412",
    "202411",
    "202410",
    "202409",
    "202408",
    "202407",
    "202406",
    "202405",
    "202404",
  ];
  return months.map((month, index) => ({
    年月: month,
    單月合併營收: index < 12 ? 200000 : 100000,
  }));
}

test("stock summary classifiers handle nulls, valuation, growth, and narrative text", () => {
  assert.equal(typeof stockSummary.classifyValuation, "function");
  assert.equal(typeof stockSummary.classifyGrowth, "function");
  assert.equal(typeof stockSummary.classifyMomentum, "function");
  assert.equal(typeof stockSummary.classifyDividend, "function");
  assert.equal(typeof stockSummary.joinValuationGrowth, "function");
  assert.equal(typeof stockSummary.buildNarrative, "function");

  assert.deepEqual(stockSummary.classifyValuation(null), {
    key: "unknown",
    text: "估值資料不足",
  });
  assert.equal(stockSummary.classifyValuation(-3).key, "loss");
  assert.doesNotMatch(stockSummary.classifyValuation(-3).text, /估值偏高/);
  assert.equal(stockSummary.classifyValuation(5).key, "low");
  assert.equal(stockSummary.classifyValuation(15).key, "fair");
  assert.equal(stockSummary.classifyValuation(25).key, "high");
  assert.equal(stockSummary.classifyValuation(50).key, "very_high");

  assert.equal(stockSummary.classifyGrowth(12, 15).key, "strong");
  assert.equal(stockSummary.classifyGrowth(5, 3).key, "mild");
  assert.equal(stockSummary.classifyGrowth(5, -3).key, "sales_only");
  assert.equal(stockSummary.classifyGrowth(-5, 3).key, "eps_only");
  assert.equal(stockSummary.classifyGrowth(-5, -3).key, "weak");
  assert.equal(stockSummary.classifyGrowth(null, 3).key, "unknown");

  assert.equal(stockSummary.classifyMomentum(null), null);
  assert.equal(stockSummary.classifyMomentum(7).extension, "動能延續中");
  assert.match(stockSummary.classifyDividend(null).text, /無現金配息資料/);
  assert.doesNotMatch(stockSummary.classifyDividend(null).text, /0\.00%/);
  assert.equal(stockSummary.joinValuationGrowth("high", "strong"), "但");

  const narrative = stockSummary.buildNarrative({
    name: "台積電",
    ticker: "2330",
    valuation: stockSummary.classifyValuation(28.2),
    growth: stockSummary.classifyGrowth(14.3, 22.5),
    momentum: stockSummary.classifyMomentum(8.2),
    dividend: stockSummary.classifyDividend(2.1),
    salesYoy: 14.3,
    epsYoy: 22.5,
    threeM: 8.2,
  });
  assert.match(narrative, /台積電（2330）/);
  assert.match(narrative, /估值偏高/);
  assert.doesNotMatch(narrative, /\{|\bnull\b|NaN|undefined/);
});

test("classifyMomentum maps each 3M return bucket to its verb and extension", () => {
  const cases = [
    { input: null, expected: null },
    {
      input: -10,
      expected: { key: "weak", verb: "下跌", extension: "走勢承壓" },
    },
    {
      input: -3,
      expected: { key: "soft", verb: "微幅下跌", extension: "走勢偏弱" },
    },
    {
      input: 3,
      expected: { key: "stable", verb: "微幅上漲", extension: "走勢偏穩" },
    },
    {
      input: 7,
      expected: { key: "up", verb: "上漲", extension: "動能延續中" },
    },
    {
      input: 15,
      expected: { key: "strong", verb: "上漲", extension: "動能強勁" },
    },
  ];
  for (const { input, expected } of cases) {
    assert.deepEqual(
      stockSummary.classifyMomentum(input),
      expected,
      `momentum(${input})`,
    );
  }
});

test("classifyDividend maps yield buckets to text without leaking 0.00% on null", () => {
  const cases = [
    {
      input: null,
      key: "unknown",
      textIncludes: "無現金配息資料",
      textExcludes: /0\.00%/,
    },
    {
      input: 0,
      key: "unknown",
      textIncludes: "無現金配息資料",
      textExcludes: /0\.00%/,
    },
    { input: 0.5, key: "low", textIncludes: "偏低" },
    { input: 2, key: "fair", textIncludes: "中性" },
    { input: 4, key: "attractive", textIncludes: "吸引力" },
    { input: 7, key: "high", textIncludes: "偏高" },
  ];
  for (const { input, key, textIncludes, textExcludes } of cases) {
    const result = stockSummary.classifyDividend(input);
    assert.equal(result.key, key, `dividend(${input}).key`);
    assert.ok(
      result.text.includes(textIncludes),
      `dividend(${input}).text contains "${textIncludes}"`,
    );
    if (textExcludes) {
      assert.doesNotMatch(
        result.text,
        textExcludes,
        `dividend(${input}).text excludes ${textExcludes}`,
      );
    }
  }
});

test("joinValuationGrowth covers the full key matrix from the plan", () => {
  const cases = [
    { val: "high", growth: "strong", expected: "但" },
    { val: "very_high", growth: "strong", expected: "但" },
    { val: "high", growth: "mild", expected: "且" },
    { val: "high", growth: "sales_only", expected: "且" },
    { val: "high", growth: "eps_only", expected: "且" },
    { val: "high", growth: "weak", expected: "且" },
    { val: "very_high", growth: "weak", expected: "且" },
    { val: "fair", growth: "strong", expected: "，且" },
    { val: "fair", growth: "mild", expected: "，但" },
    { val: "fair", growth: "sales_only", expected: "，但" },
    { val: "fair", growth: "weak", expected: "，但" },
    { val: "low", growth: "strong", expected: "，且" },
    { val: "low", growth: "mild", expected: "，且" },
    { val: "low", growth: "sales_only", expected: "，且" },
    { val: "low", growth: "eps_only", expected: "，且" },
    { val: "low", growth: "weak", expected: "，但" },
    { val: "loss", growth: "strong", expected: "" },
    { val: "loss", growth: "weak", expected: "" },
    { val: "unknown", growth: "strong", expected: "，" },
    { val: "high", growth: "unknown", expected: "，" },
    { val: "unknown", growth: "unknown", expected: "，" },
  ];
  for (const { val, growth, expected } of cases) {
    assert.equal(
      stockSummary.joinValuationGrowth(val, growth),
      expected,
      `join(${val}, ${growth})`,
    );
  }
});

test("buildNarrative uses an independent loss template when PE is negative", () => {
  const narrative = stockSummary.buildNarrative({
    name: "某虧損公司",
    ticker: "9999",
    valuation: stockSummary.classifyValuation(-3),
    growth: stockSummary.classifyGrowth(5, 8),
    momentum: stockSummary.classifyMomentum(2),
    dividend: stockSummary.classifyDividend(null),
    salesYoy: 5,
    epsYoy: 8,
    threeM: 2,
  });
  assert.match(narrative, /PE 為負/);
  assert.match(narrative, /；/);
  assert.doesNotMatch(narrative, /估值偏高/);
  assert.doesNotMatch(narrative, /\{|\bnull\b|NaN|undefined/);
});

test("renderStockSummary renders a narrative, chips, and escaped content", () => {
  withMockElement("stock-summary-content", (container) => {
    stockSummary.renderStockSummary({
      profile: [
        {
          股票代號: "2330",
          股票名稱: '<img src=x onerror="alert(1)">',
        },
      ],
      quotes: [
        { 日期: "2025-12-31", 收盤價: 80 },
        { 日期: "2026-02-28", 收盤價: 100 },
        {
          日期: "2026-03-31",
          收盤價: 120,
          漲跌: 5,
          漲幅: 4.35,
          本益比: 21.5,
          股價淨值比: 2.3,
        },
      ],
      sales: makeSalesRows(),
      income: [
        { 年季: "202504", 每股稅後盈餘: 2 },
        { 年季: "202503", 每股稅後盈餘: 2 },
        { 年季: "202502", 每股稅後盈餘: 2 },
        { 年季: "202501", 每股稅後盈餘: 2 },
        { 年季: "202404", 每股稅後盈餘: 1 },
        { 年季: "202403", 每股稅後盈餘: 1 },
        { 年季: "202402", 每股稅後盈餘: 1 },
        { 年季: "202401", 每股稅後盈餘: 1 },
      ],
      dividend: [{ 年度現金股利: 6 }],
      ruleScore: {
        score: 6,
        available: 5,
        triggered: 2,
        na: 2,
        displayText: "6.0",
      },
    });

    assert.doesNotMatch(container.innerHTML, /class="info-card/);
    assert.match(container.innerHTML, /class="stock-summary-header"/);
    assert.match(container.innerHTML, /class="stock-summary-narrative"/);
    assert.equal(
      (container.innerHTML.match(/<span class="stock-summary-chip/g) ?? [])
        .length,
      4,
    );
    assert.match(container.innerHTML, /規則評分/);
    assert.match(container.innerHTML, /class="score-card-large"/);
    assert.match(container.innerHTML, /6\.0/);
    assert.match(container.innerHTML, /警示 2 \/ 可評估 5 \/ 資料不足 2/);
    assert.match(container.innerHTML, /殖利率/);
    assert.match(container.innerHTML, /1M/);
    assert.match(container.innerHTML, /3M/);
    assert.match(container.innerHTML, /TTM YoY/);
    assert.match(container.innerHTML, /\+100\.00%/);
    assert.doesNotMatch(container.innerHTML, /<img src=x/);
    assert.match(
      container.innerHTML,
      /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/,
    );
  });
});

test("renderStockSummary renders missing values as dashes without accidental 0.00%", () => {
  withMockElement("stock-summary-content", (container) => {
    stockSummary.renderStockSummary({
      profile: [{ 股票代號: "0050", 股票名稱: "元大台灣50" }],
      quotes: [],
      sales: [],
      income: [],
      dividend: [],
      ruleScore: null,
    });

    assert.match(container.innerHTML, /資料不足|無現金配息資料/);
    assert.match(container.innerHTML, /殖利率 —/);
    assert.match(container.innerHTML, /1M —/);
    assert.match(container.innerHTML, /3M —/);
    assert.match(container.innerHTML, /TTM YoY —/);
    assert.doesNotMatch(container.innerHTML, /0\.00%/);
  });
});
