import { test } from "node:test";
import assert from "node:assert/strict";
import { safeDiv, cagr } from "../js/utils.js";

// --- safeDiv ---

test("safeDiv normal division", () => {
  assert.equal(safeDiv(10, 2), 5);
});

test("safeDiv zero denominator returns null", () => {
  assert.equal(safeDiv(1, 0), null);
});

test("safeDiv NaN numerator returns null", () => {
  assert.equal(safeDiv(NaN, 2), null);
});

test("safeDiv NaN denominator returns null", () => {
  assert.equal(safeDiv(2, NaN), null);
});

test("safeDiv Infinity returns null", () => {
  assert.equal(safeDiv(Infinity, 2), null);
});

test("safeDiv string-coercible inputs work", () => {
  assert.equal(safeDiv("10", "5"), 2);
});

test("safeDiv null numerator coerces to 0 (Number(null)===0)", () => {
  assert.equal(safeDiv(null, 5), 0);
});

// --- cagr ---

test("cagr flat series returns 0", () => {
  assert.equal(cagr(100, 100, 5), 0);
});

test("cagr doubling over 1 year returns ~1.0", () => {
  const result = cagr(200, 100, 1);
  assert.ok(Math.abs(result - 1) < 1e-9);
});

test("cagr 100→200 over 5 years", () => {
  const result = cagr(200, 100, 5);
  // (200/100)^(1/5) - 1 ≈ 0.1487
  assert.ok(Math.abs(result - 0.1487) < 0.001);
});

test("cagr start <= 0 returns null", () => {
  assert.equal(cagr(100, 0, 5), null);
  assert.equal(cagr(100, -10, 5), null);
});

test("cagr years <= 0 returns null", () => {
  assert.equal(cagr(100, 50, 0), null);
  assert.equal(cagr(100, 50, -1), null);
});

test("cagr NaN input returns null", () => {
  assert.equal(cagr(NaN, 100, 5), null);
  assert.equal(cagr(100, NaN, 5), null);
  assert.equal(cagr(100, 100, NaN), null);
});
