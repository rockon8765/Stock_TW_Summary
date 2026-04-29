import { test } from "node:test";
import assert from "node:assert/strict";
import { renderIncome } from "../js/modules/income.js";

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

test("renderIncome shows quarterly revenue in the correct magnitude after 仟元 conversion", () => {
  withMockElement("income-table-container", (container) => {
    renderIncome([
      {
        年季: "202504",
        營業收入淨額: 1046090421,
        營業毛利淨額: 615000000,
        營業利益: 520000000,
        稅後純益: 505000000,
        每股稅後盈餘: 19.5,
      },
    ]);

    assert.match(container.innerHTML, /10,460\.90 億/);
  });
});

test("renderIncome keeps level metrics on neutral color semantics", () => {
  withMockElement("income-table-container", (container) => {
    renderIncome([
      {
        年季: "202504",
        營業收入淨額: 1046090421,
        營業毛利淨額: 615000000,
        營業利益: 520000000,
        稅後純益: -505000000,
        每股稅後盈餘: -19.5,
      },
    ]);

    assert.doesNotMatch(container.innerHTML, /class="val-up">-19\.50/);
    assert.doesNotMatch(container.innerHTML, /class="val-down">-19\.50/);
    assert.match(container.innerHTML, /class="val-neutral">-19\.50/);
  });
});

test("renderIncome keeps the visible table capped at the latest 8 quarters", () => {
  withMockElement("income-table-container", (container) => {
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
    renderIncome(
      quarters.map((quarter) => ({
        年季: quarter,
        營業收入淨額: 100000,
        營業毛利淨額: 50000,
        營業利益: 30000,
        稅後純益: 20000,
        每股稅後盈餘: 1,
      })),
    );

    assert.match(container.innerHTML, /202504/);
    assert.match(container.innerHTML, /202401/);
    assert.doesNotMatch(container.innerHTML, /202304/);
    assert.doesNotMatch(container.innerHTML, /202303/);
  });
});
