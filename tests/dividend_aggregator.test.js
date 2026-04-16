import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateDividendsToAnnual } from "../js/lib/dividend_aggregator.js";

// --- null / empty input ---

test("null input returns empty array", () => {
  assert.deepEqual(aggregateDividendsToAnnual(null), []);
});

test("undefined input returns empty array", () => {
  assert.deepEqual(aggregateDividendsToAnnual(undefined), []);
});

test("empty array returns empty array", () => {
  assert.deepEqual(aggregateDividendsToAnnual([]), []);
});

// --- basic aggregation ---

test("single quarter maps to single annual entry", () => {
  const out = aggregateDividendsToAnnual([
    { 年季: "202401", 現金股利合計: 3.0, 股票股利合計: 0, 除息日: "2024-07-01" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].年度, "2024");
  assert.equal(out[0].年度現金股利, 3.0);
  assert.equal(out[0].年度股票股利, 0);
  assert.equal(out[0].年度股利合計, 3.0);
  assert.equal(out[0].除息日, "2024-07-01");
});

test("multiple quarters in same year are summed", () => {
  const out = aggregateDividendsToAnnual([
    { 年季: "202401", 現金股利合計: 1, 股票股利合計: 0 },
    { 年季: "202402", 現金股利合計: 2, 股票股利合計: 0.5 },
    { 年季: "202403", 現金股利合計: 3, 股票股利合計: 0 },
    { 年季: "202404", 現金股利合計: 4, 股票股利合計: 0 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].年度現金股利, 10);
  assert.equal(out[0].年度股票股利, 0.5);
  assert.equal(out[0].年度股利合計, 10.5);
});

test("multiple years are separated and sorted desc", () => {
  const out = aggregateDividendsToAnnual([
    { 年季: "202301", 現金股利合計: 5, 股票股利合計: 0 },
    { 年季: "202401", 現金股利合計: 7, 股票股利合計: 0 },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].年度, "2024"); // newer first
  assert.equal(out[1].年度, "2023");
});

// --- 除息日 picks latest quarter's non-null value ---

test("除息日 picks latest quarter value", () => {
  const out = aggregateDividendsToAnnual([
    { 年季: "202401", 現金股利合計: 1, 股票股利合計: 0, 除息日: "2024-03-15" },
    { 年季: "202403", 現金股利合計: 1, 股票股利合計: 0, 除息日: "2024-09-20" },
  ]);
  assert.equal(out[0].除息日, "2024-09-20");
});

test("除息日 falls back to earlier quarter if latest is null", () => {
  const out = aggregateDividendsToAnnual([
    { 年季: "202401", 現金股利合計: 1, 股票股利合計: 0, 除息日: "2024-03-15" },
    { 年季: "202402", 現金股利合計: 1, 股票股利合計: 0 },
  ]);
  assert.equal(out[0].除息日, "2024-03-15");
});

// --- edge cases ---

test("missing 現金股利合計 treated as 0", () => {
  const out = aggregateDividendsToAnnual([
    { 年季: "202401", 股票股利合計: 1 },
  ]);
  assert.equal(out[0].年度現金股利, 0);
  assert.equal(out[0].年度股票股利, 1);
});

test("null row in array is skipped", () => {
  const out = aggregateDividendsToAnnual([
    null,
    { 年季: "202401", 現金股利合計: 5, 股票股利合計: 0 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].年度現金股利, 5);
});

test("output does not contain internal _latestYQ field", () => {
  const out = aggregateDividendsToAnnual([
    { 年季: "202401", 現金股利合計: 1, 股票股利合計: 0 },
  ]);
  assert.ok(!("_latestYQ" in out[0]));
});

test("output does not contain 殖利率 or 發放率 fields", () => {
  const out = aggregateDividendsToAnnual([
    {
      年季: "202401",
      現金股利合計: 1,
      股票股利合計: 0,
      現金股利殖利率: 0.4,
      股利發放率: 60,
    },
  ]);
  assert.ok(!("現金殖利率" in out[0]));
  assert.ok(!("發放率" in out[0]));
  assert.ok(!("現金股利殖利率" in out[0]));
  assert.ok(!("股利發放率" in out[0]));
});
