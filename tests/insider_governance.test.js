import { test } from "node:test";
import assert from "node:assert/strict";
import { renderInsiderGovernance } from "../js/modules/insider_governance.js";

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

test("renderInsiderGovernance groups pledge columns inside each holder group", () => {
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

    assert.match(container.innerHTML, /<th colspan="3"[^>]*>董監<\/th>/);
    assert.match(container.innerHTML, /<th colspan="3"[^>]*>經理人<\/th>/);
    assert.match(container.innerHTML, /<th colspan="3"[^>]*>大股東<\/th>/);
    assert.doesNotMatch(
      container.innerHTML,
      /<th colspan="3"[^>]*>設質比例<\/th>/,
    );
    assert.equal(
      (container.innerHTML.match(/<th[^>]*>持股%<\/th>/g) ?? []).length,
      3,
    );
    assert.equal(
      (
        container.innerHTML.match(
          /<th[^>]*\bgroup-start\b[^>]*>持股%<\/th>/g,
        ) ?? []
      ).length,
      3,
      "every 持股% header should sit at the start of its column group",
    );
    assert.match(
      container.innerHTML,
      /<td class="text-center group-start">12\.30%<\/td>/,
    );
    assert.match(
      container.innerHTML,
      /12\.30%[\s\S]*10\.00%[\s\S]*1\.20%[\s\S]*20\.00%[\s\S]*45\.60%[\s\S]*30\.00%/,
    );
  });
});
