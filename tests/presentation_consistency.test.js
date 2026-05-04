import test from "node:test";
import assert from "node:assert/strict";
import { renderInstitutional } from "../js/modules/institutional.js";
import { renderShareholders } from "../js/modules/shareholders.js";

function withMockDocument(elements, fn) {
  const originalDocument = global.document;
  global.document = {
    getElementById(id) {
      return elements[id] ?? null;
    },
  };

  try {
    fn(elements);
  } finally {
    global.document = originalDocument;
  }
}

test("institutional directional values keep explicit +/- signs without inline arrow glyphs", () => {
  withMockDocument(
    {
      "institutional-table-container": { innerHTML: "" },
      "institutional-cards": { innerHTML: "" },
    },
    (elements) => {
      renderInstitutional(
        [
          { 日期: "2026-04-15", 外資買賣超: 4826, 外資持股比率: 72.4 },
          { 日期: "2026-04-14", 外資買賣超: -1200, 外資持股比率: 72.3 },
        ],
        [
          { 日期: "2026-04-15", 投信買賣超: -138, 投信持股比率: 5.4 },
          { 日期: "2026-04-14", 投信買賣超: 615, 投信持股比率: 5.5 },
        ],
        [
          { 日期: "2026-04-15", 自營商買賣超: 244, 自營商買賣超_自行買賣: 120 },
          { 日期: "2026-04-14", 自營商買賣超: -88, 自營商買賣超_自行買賣: -10 },
        ],
      );

      const tableHtml = elements["institutional-table-container"].innerHTML;
      const cardsHtml = elements["institutional-cards"].innerHTML;

      assert.match(tableHtml, /\+4,826/);
      assert.match(tableHtml, /-138/);
      assert.match(cardsHtml, /\+4,826 張/);
      assert.doesNotMatch(tableHtml, /▲|▼/);
      assert.doesNotMatch(cardsHtml, /▲|▼/);
    },
  );
});

test("shareholder change cues keep explicit +/- signs without inline arrow glyphs", () => {
  withMockDocument(
    {
      "shareholders-table-container": { innerHTML: "" },
    },
    (elements) => {
      renderShareholders([
        {
          日期: "2026-04-10",
          "1000張以上佔集保比率": 85.56,
          "400張以上佔集保比率": 88.3,
          "100張以下佔集保比率": 9.14,
        },
        {
          日期: "2026-04-02",
          "1000張以上佔集保比率": 85.48,
          "400張以上佔集保比率": 88.25,
          "100張以下佔集保比率": 9.21,
        },
      ]);

      const html = elements["shareholders-table-container"].innerHTML;

      assert.match(html, /\+0\.08/);
      assert.match(html, /\+0\.05/);
      assert.match(html, /-0\.07/);
      assert.match(html, /\+0\.02/);
      assert.doesNotMatch(html, /▲|▼/);
    },
  );
});

test("shareholder rows omit week-over-week cues when no previous row exists", () => {
  withMockDocument(
    {
      "shareholders-table-container": { innerHTML: "" },
    },
    (elements) => {
      renderShareholders([
        {
          日期: "2026-04-10",
          "1000張以上佔集保比率": 85.56,
          "400張以上佔集保比率": 88.3,
          "100張以下佔集保比率": 9.14,
        },
      ]);

      const html = elements["shareholders-table-container"].innerHTML;

      assert.doesNotMatch(html, /class="text-xs/);
      assert.doesNotMatch(html, /▲|▼/);
    },
  );
});
