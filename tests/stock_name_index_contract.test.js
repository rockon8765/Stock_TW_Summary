import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("stock_name_index.json includes common company aliases", () => {
  const index = JSON.parse(readFileSync("stock_name_index.json", "utf8"));
  const mediatek = index.find((entry) => entry.ticker === "2454");

  assert.ok(Array.isArray(index));
  assert.ok(mediatek);
  assert.ok(mediatek.names.includes("聯發科"));
  assert.ok(mediatek.names.includes("聯發科技股份有限公司"));
});

test("GitHub Pages artifact includes stock_name_index.json", () => {
  const workflow = readFileSync(
    ".github/workflows/deploy-pages.yml",
    "utf8",
  );

  assert.match(workflow, /cp stock_name_index\.json _site\//);
});
