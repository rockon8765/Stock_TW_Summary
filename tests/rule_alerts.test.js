import { test } from "node:test";
import assert from "node:assert/strict";
import { renderRuleAlerts } from "../js/modules/rule_alerts.js";

const CODES = ["S10", "S11", "S12", "S13", "S20", "S22", "S17"];

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

function makeRuleResult(overrides = {}) {
  const rules = CODES.map((code, ruleIndex) => {
    const periods = Array.from({ length: 6 }, (_, periodIndex) => ({
      label: `P${periodIndex + 1}`,
      triggered: periodIndex === 5 && ruleIndex < 2,
      detail: `detail ${code} ${periodIndex + 1}`,
    }));
    return {
      code,
      name: `條件 ${ruleIndex + 1}`,
      frequency: ruleIndex % 3 === 0 ? "monthly" : ruleIndex % 3 === 1 ? "quarterly" : "monthEndDaily",
      detail: `row detail ${ruleIndex + 1}`,
      periods,
      latest: periods[5],
      triggered: periods[5].triggered === true,
    };
  });

  return {
    rules,
    alertCount: 2,
    latestAlertCount: 2,
    latestAvailableCount: 7,
    latestNaCount: 0,
    ...overrides,
  };
}

test("renderRuleAlerts produces a table with 7 rows and 6 dot cells per row", () => {
  withMockElement("rule-alerts-container", (container) => {
    renderRuleAlerts(makeRuleResult());

    assert.match(container.innerHTML, /rule-alerts-table/);
    assert.equal((container.innerHTML.match(/<tr>/g) ?? []).length, 7);
    assert.equal((container.innerHTML.match(/class="dot dot-/g) ?? []).length, 42);
    assert.match(container.innerHTML, /本期警示 <strong class="val-warn">2\/7<\/strong>/);
    assert.doesNotMatch(container.innerHTML, /class="rule-code"/);
    assert.doesNotMatch(container.innerHTML, />S10</);
  });
});

test("renderRuleAlerts shows dash cells and summary count for null-triggered latest periods", () => {
  withMockElement("rule-alerts-container", (container) => {
    const result = makeRuleResult();
    result.rules[6].periods[5] = {
      label: "2026-04",
      triggered: null,
      detail: "資料不足",
    };
    result.rules[6].latest = result.rules[6].periods[5];
    result.rules[6].triggered = false;
    result.latestAvailableCount = 6;
    result.latestNaCount = 1;

    renderRuleAlerts(result);

    assert.match(container.innerHTML, /dot dot-na/);
    assert.match(container.innerHTML, />—<\/div>/);
    assert.match(container.innerHTML, /本期警示 <strong class="val-warn">2\/6<\/strong>，資料不足 1/);
  });
});

test("renderRuleAlerts handles empty or null ruleResult gracefully", () => {
  withMockElement("rule-alerts-container", (container) => {
    renderRuleAlerts(null);

    assert.match(container.innerHTML, /即時規則警示資料不足/);
    assert.doesNotMatch(container.innerHTML, /<table/);
  });
});

test("renderRuleAlerts escapes rule and period text before writing innerHTML", () => {
  withMockElement("rule-alerts-container", (container) => {
    const periods = Array.from({ length: 6 }, (_, index) => ({
      label: index === 5 ? '<script>alert("label")</script>' : `P${index + 1}`,
      triggered: index === 5,
      detail: index === 5 ? '<img src=x onerror="alert(1)">' : "ok",
    }));
    renderRuleAlerts({
      rules: [
        {
          code: "<b>S10</b>",
          name: '<svg onload="alert(1)">',
          frequency: "monthly",
          detail: '<script>alert("row")</script>',
          periods,
          latest: periods[5],
          triggered: true,
        },
      ],
      alertCount: 1,
      latestAlertCount: 1,
      latestAvailableCount: 1,
      latestNaCount: 0,
    });

    assert.doesNotMatch(container.innerHTML, /<svg onload=/);
    assert.doesNotMatch(container.innerHTML, /<script>alert/);
    assert.doesNotMatch(container.innerHTML, /<img src=x onerror=/);
    assert.match(container.innerHTML, /&lt;svg onload=&quot;alert\(1\)&quot;&gt;/);
    assert.match(container.innerHTML, /&lt;script&gt;alert\(&quot;label&quot;\)&lt;\/script&gt;/);
  });
});
