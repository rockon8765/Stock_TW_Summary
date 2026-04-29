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
