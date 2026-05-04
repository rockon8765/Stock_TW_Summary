import { test } from "node:test";
import assert from "node:assert/strict";
import { renderRevenue } from "../js/modules/revenue.js";

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

test("renderRevenue formats monthsales 仟元 fields as materially correct 億 values", () => {
  withMockElement("revenue-table-container", (container) => {
    renderRevenue([
      {
        年月: "202603",
        單月合併營收: 415191699,
        單月合併營收月變動: 10.5,
        單月合併營收年成長: 22.8,
        累計合併營收: 1134103440,
        累計合併營收成長: 18.2,
      },
    ]);

    assert.match(container.innerHTML, /4,151\.92 億/);
    assert.match(container.innerHTML, /11,341\.03 億/);
  });
});

function monthRowsForRollingTest() {
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
    單月合併營收月變動: 1,
    單月合併營收年成長: 2,
    累計合併營收: index < 12 ? 2000000 : 1000000,
    累計合併營收成長: 3,
  }));
}

test("renderRevenue adds 3M rolling and 12M TTM YoY columns from monthly revenue", () => {
  withMockElement("revenue-table-container", (container) => {
    renderRevenue(monthRowsForRollingTest());

    assert.match(container.innerHTML, /<th>單月 YoY%<\/th>/);
    assert.match(container.innerHTML, /<th>3M YoY%<\/th>/);
    assert.match(container.innerHTML, /<th>12M TTM YoY%<\/th>/);
    assert.match(container.innerHTML, /\+100\.00%/);
    assert.match(container.innerHTML, /202603/);
    assert.match(container.innerHTML, /202504/);
    assert.doesNotMatch(container.innerHTML, /202503/);
  });
});
