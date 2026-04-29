import { test } from "node:test";
import assert from "node:assert/strict";
import { renderValuation } from "../js/modules/valuation.js";

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

test("renderValuation keeps the visible table capped at the latest 8 quarters", () => {
  withMockElement("valuation-table-container", (container) => {
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
    ];

    renderValuation(
      quarters.map((quarter) => ({
        年季: quarter,
        營業收入淨額: 100000,
        營業毛利淨額: 50000,
        營業利益: 30000,
        每股稅後盈餘: 1,
      })),
      [],
    );

    assert.match(container.innerHTML, /202504/);
    assert.match(container.innerHTML, /202401/);
    assert.doesNotMatch(container.innerHTML, /202304/);
    assert.doesNotMatch(container.innerHTML, /202303/);
  });
});
