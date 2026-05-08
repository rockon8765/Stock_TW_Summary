import { test } from "node:test";
import assert from "node:assert/strict";
import { renderCashflow } from "../js/modules/cashflow.js";
import { renderInsiderGovernance } from "../js/modules/insider_governance.js";
import { renderRiskTechnical } from "../js/modules/risk_technical.js";

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

test("renderInsiderGovernance renders 年月 values as YYYY-MM", () => {
  withMockElement("governance-table-container", (container) => {
    renderInsiderGovernance([
      {
        年月: "202603",
        董監持股比例: 12.3,
        董監持股比例增減: 0.1,
        經理人持股比例: 1.2,
        經理人持股比例增減: -0.2,
        大股東持股比例: 45.6,
        大股東持股比例增減: 0,
        董監設質比例: 10,
        經理人設質比例: 20,
        大股東設質比例: 30,
      },
    ]);

    assert.match(container.innerHTML, /2026-03/);
    assert.doesNotMatch(container.innerHTML, />202603</);
  });
});

test("renderCashflow renders 年季 values as YYYYQ#", () => {
  withMockElement("cashflow-table-container", (container) => {
    renderCashflow([
      {
        年季: "202504",
        營業活動之淨現金流入流出: 100000,
        投資活動之淨現金流入流出: -20000,
        籌資活動之淨現金流入流出: -30000,
        自由現金流量: 80000,
        發放現金股利: -10000,
      },
      {
        年季: "202503",
        營業活動之淨現金流入流出: 90000,
        投資活動之淨現金流入流出: -10000,
        籌資活動之淨現金流入流出: -20000,
        自由現金流量: 70000,
        發放現金股利: -10000,
      },
      {
        年季: "202502",
        營業活動之淨現金流入流出: 80000,
        投資活動之淨現金流入流出: -10000,
        籌資活動之淨現金流入流出: -20000,
        自由現金流量: 60000,
        發放現金股利: -10000,
      },
      {
        年季: "202501",
        營業活動之淨現金流入流出: 70000,
        投資活動之淨現金流入流出: -10000,
        籌資活動之淨現金流入流出: -20000,
        自由現金流量: 50000,
        發放現金股利: -10000,
      },
    ]);

    assert.match(container.innerHTML, /2025Q4/);
    assert.doesNotMatch(container.innerHTML, />202504</);
  });
});

test("renderRiskTechnical labels the monthly trend table with 年月", () => {
  withMockElement("risk-tech-container", (container) => {
    renderRiskTechnical([
      {
        日期: "2026-03-29",
        Beta係數250D: 1.1,
        Beta係數65D: 0.9,
        年化波動度250D: 0.33,
        Alpha250D: 0.01,
        乖離率250日: 2.5,
        月K9: 60,
        月D9: 55,
        月RSI10: 50,
        月MACD: 1.234,
      },
    ]);

    assert.match(container.innerHTML, /<th>年月<\/th>/);
    assert.match(container.innerHTML, />2026-03</);
    assert.doesNotMatch(container.innerHTML, /<th>月份<\/th>/);
  });
});
