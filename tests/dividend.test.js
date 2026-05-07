import { test } from "node:test";
import assert from "node:assert/strict";
import { renderDividend } from "../js/modules/dividend.js";

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

test("renderDividend explains annual cash yield calculation in the table header", () => {
  withMockElement("dividend-table-container", (container) => {
    renderDividend({
      annualDiv: [
        {
          年度: "2025",
          年度現金股利: 6,
          年度股票股利: 0,
          年度股利合計: 6,
          除息日: "2026-01-10",
        },
      ],
      quotes: [{ 日期: "2025-12-31", 收盤價: 100 }],
      annualIs: [{ 年度: "2025", 每股稅後盈餘: 12 }],
    });

    assert.match(container.innerHTML, /年度現金殖利率/);
    assert.match(container.innerHTML, /以年度宣告現金股利 ÷ 該年最後交易日收盤計算/);
    assert.match(container.innerHTML, /6\.00%/);
  });
});
