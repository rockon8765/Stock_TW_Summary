import { test } from "node:test";
import assert from "node:assert/strict";
import { renderStockSummary } from "../js/modules/stock_summary.js";

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

test("renderStockSummary renders four decision cards with escaped content", () => {
  withMockElement("stock-summary-content", (container) => {
    renderStockSummary({
      profile: [{ 股票名稱: '<img src=x onerror="alert(1)">' }],
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

    assert.equal((container.innerHTML.match(/class="info-card/g) ?? []).length, 4);
    assert.match(container.innerHTML, /規則評分/);
    assert.match(container.innerHTML, /6\.0/);
    assert.match(container.innerHTML, /警示 2 \/ 可評估 5 \/ 資料不足 2/);
    assert.match(container.innerHTML, /PE 21\.5/);
    assert.match(container.innerHTML, /PB 2\.30/);
    assert.match(container.innerHTML, /殖利率 5\.00%/);
    assert.match(container.innerHTML, /12M TTM YoY/);
    assert.match(container.innerHTML, /\+100\.00%/);
    assert.match(container.innerHTML, /1M <span class="val-up">\+20\.00%<\/span>/);
    assert.match(container.innerHTML, /3M <span class="val-up">\+50\.00%<\/span>/);
    assert.doesNotMatch(container.innerHTML, /<img src=x/);
    assert.match(container.innerHTML, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  });
});
