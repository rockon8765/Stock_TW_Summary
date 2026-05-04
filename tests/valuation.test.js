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
        稅後純益: 20000,
        每股稅後盈餘: 1,
      })),
      [],
    );

    assert.match(container.innerHTML, /2025Q4/);
    assert.match(container.innerHTML, /2024Q1/);
    assert.doesNotMatch(container.innerHTML, /2023Q4/);
    assert.doesNotMatch(container.innerHTML, /2023Q3/);
  });
});

test("renderValuation renders all 7 expected column headers", () => {
  withMockElement("valuation-table-container", (container) => {
    renderValuation(
      [
        {
          年季: "202504",
          營業收入淨額: 1000000,
          營業毛利淨額: 500000,
          營業利益: 300000,
          稅後純益: 200000,
          每股稅後盈餘: 5,
        },
      ],
      [{ 年季: "202504", 每股淨值: 50 }],
    );
    for (const header of [
      "年季",
      "營收淨額",
      "毛利率",
      "營益率",
      "淨利率",
      "EPS",
      "每股淨值",
    ]) {
      assert.match(container.innerHTML, new RegExp(header));
    }
  });
});

test("renderValuation computes 淨利率 from 稅後純益 / 營業收入淨額", () => {
  withMockElement("valuation-table-container", (container) => {
    renderValuation(
      [
        {
          年季: "202504",
          營業收入淨額: 1000000,
          營業毛利淨額: 500000,
          營業利益: 300000,
          稅後純益: 250000,
          每股稅後盈餘: 5,
        },
      ],
      [],
    );
    // 250000 / 1000000 = 25.00%
    assert.match(container.innerHTML, /25\.00%/);
  });
});

test("renderValuation joins 每股淨值 from bsData by 年季", () => {
  withMockElement("valuation-table-container", (container) => {
    renderValuation(
      [
        {
          年季: "202504",
          營業收入淨額: 1000000,
          營業毛利淨額: 500000,
          營業利益: 300000,
          稅後純益: 200000,
          每股稅後盈餘: 5,
        },
      ],
      [
        { 年季: "202504", 每股淨值: 87.5 },
        { 年季: "202503", 每股淨值: 80.0 },
      ],
    );
    assert.match(container.innerHTML, /2025Q4/);
    assert.match(container.innerHTML, /87\.50/);
  });
});

test("renderValuation falls back to — when 每股淨值 join misses", () => {
  withMockElement("valuation-table-container", (container) => {
    renderValuation(
      [
        {
          年季: "202504",
          營業收入淨額: 1000000,
          營業毛利淨額: 500000,
          營業利益: 300000,
          稅後純益: 200000,
          每股稅後盈餘: 5,
        },
      ],
      [{ 年季: "202503", 每股淨值: 80.0 }], // 沒對應到 202504
    );
    // 表格內最後一欄應為 — (em-dash)
    assert.match(container.innerHTML, /<td>—<\/td>/);
  });
});

test("renderValuation displays 營收淨額 in 億 with locale separators (仟元 → 億)", () => {
  withMockElement("valuation-table-container", (container) => {
    renderValuation(
      [
        {
          年季: "202504",
          營業收入淨額: 1046090421, // 仟元 → 1,046,090,421 / 100,000 = 10,460.90 億
          營業毛利淨額: 500000000,
          營業利益: 300000000,
          稅後純益: 200000000,
          每股稅後盈餘: 5,
        },
      ],
      [],
    );
    assert.match(container.innerHTML, /10,460\.90 億/);
  });
});

test("renderValuation keeps level metrics on neutral color regardless of sign", () => {
  withMockElement("valuation-table-container", (container) => {
    renderValuation(
      [
        {
          年季: "202504",
          營業收入淨額: 1000000,
          營業毛利淨額: 500000,
          營業利益: 300000,
          稅後純益: -200000,
          每股稅後盈餘: -5,
        },
      ],
      [],
    );
    // EPS 為負，仍應 neutral（不可被當「跌」紅色）
    assert.doesNotMatch(container.innerHTML, /class="val-up">-5\.00/);
    assert.doesNotMatch(container.innerHTML, /class="val-down">-5\.00/);
    assert.match(container.innerHTML, /class="val-neutral">-5\.00/);
  });
});

test("renderValuation shows NotApplicable when income data is empty", () => {
  withMockElement("valuation-table-container", (container) => {
    renderValuation([], []);
    assert.match(container.innerHTML, /此標的暫無季度財務資料/);
  });
});
