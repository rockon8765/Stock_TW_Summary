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
    assert.match(container.innerHTML, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
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
