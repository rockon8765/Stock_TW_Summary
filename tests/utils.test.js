import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLoadingMarkup,
  cagr,
  escapeHtml,
  formatNumber,
  formatPercent,
  formatRevenue,
  formatRevenueFromThousand,
  formatYearMonth,
  formatYearQuarter,
  resolveRetryTicker,
  safeDiv,
  showError,
  showNotApplicable,
  valClassChange,
  valClassLevel,
} from "../js/utils.js";

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

// --- formatting helpers ---

test("formatRevenue renders base-currency amounts in 億 with locale separators", () => {
  assert.equal(formatRevenue(415191699000), "4,151.92 億");
});

test("formatRevenueFromThousand converts 仟元 input before formatting", () => {
  assert.equal(formatRevenueFromThousand(415191699), "4,151.92 億");
});

test("formatYearMonth converts 202603 to 2026-03", () => {
  assert.equal(formatYearMonth("202603"), "2026-03");
});

test("formatYearMonth accepts numeric input", () => {
  assert.equal(formatYearMonth(202603), "2026-03");
});

test("formatYearMonth returns empty for null and undefined", () => {
  assert.equal(formatYearMonth(null), "");
  assert.equal(formatYearMonth(undefined), "");
});

test("formatYearMonth returns input as-is for non-6-digit values", () => {
  assert.equal(formatYearMonth("2026-03"), "2026-03");
  assert.equal(formatYearMonth("20260"), "20260");
});

test("formatYearMonth returns input as-is for out-of-range months", () => {
  assert.equal(formatYearMonth("202613"), "202613");
  assert.equal(formatYearMonth("202600"), "202600");
});

test("formatYearQuarter converts 202504 to 2025Q4", () => {
  assert.equal(formatYearQuarter("202504"), "2025Q4");
});

test("formatYearQuarter handles Q1 through Q4", () => {
  assert.equal(formatYearQuarter("202501"), "2025Q1");
  assert.equal(formatYearQuarter("202503"), "2025Q3");
});

test("formatYearQuarter returns input as-is for invalid quarters", () => {
  assert.equal(formatYearQuarter("202505"), "202505");
  assert.equal(formatYearQuarter("202500"), "202500");
  assert.equal(formatYearQuarter("2025Q4"), "2025Q4");
});

test("formatYearQuarter returns empty for null and undefined", () => {
  assert.equal(formatYearQuarter(null), "");
  assert.equal(formatYearQuarter(undefined), "");
});

test("formatNumber warns on malformed numeric input", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);

  try {
    assert.equal(formatNumber("abc", 2, "測試欄位"), "—");
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /formatNumber/);
  assert.deepEqual(warnings[0][1], {
    field: "測試欄位",
    rawValue: "abc",
  });
});

test("formatPercent warns on malformed numeric input", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);

  try {
    assert.equal(formatPercent(undefined, 2, "漲幅"), "—");
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0][0]), /formatPercent/);
  assert.deepEqual(warnings[0][1], {
    field: "漲幅",
    rawValue: undefined,
  });
});

// --- value semantics ---

test("valClassChange keeps directional semantics for deltas", () => {
  assert.equal(valClassChange(1), "val-up");
  assert.equal(valClassChange(-1), "val-down");
  assert.equal(valClassChange(0), "val-neutral");
});

test("valClassLevel keeps level metrics neutral regardless of sign", () => {
  assert.equal(valClassLevel(12.3), "val-neutral");
  assert.equal(valClassLevel(-4.5), "val-neutral");
  assert.equal(valClassLevel(null), "val-neutral");
});

test("showNotApplicable renders a neutral empty-state message", () => {
  const element = { innerHTML: "" };
  showNotApplicable(element, "ETF 不提供季度損益");

  assert.match(element.innerHTML, /section-empty/);
  assert.match(element.innerHTML, /role="status"/);
  assert.match(element.innerHTML, /ETF 不提供季度損益/);
});

test("showError can include a retry affordance for failed sections", () => {
  const element = { innerHTML: "" };
  showError(element, "載入失敗", { retrySection: "income" });

  assert.match(element.innerHTML, /section-error/);
  assert.match(element.innerHTML, /role="alert"/);
  assert.match(element.innerHTML, /data-retry-section="income"/);
});

test("showError can bind retry buttons to the currently rendered ticker", () => {
  const element = { innerHTML: "" };
  showError(element, "載入失敗", {
    retrySection: "income",
    retryTicker: "2330",
  });

  assert.match(element.innerHTML, /data-retry-ticker="2330"/);
});

test("resolveRetryTicker prefers the rendered ticker over an unsent input draft", () => {
  assert.equal(resolveRetryTicker("2330", "2317"), "2330");
});

test("buildLoadingMarkup exposes an accessible status message for skeleton UIs", () => {
  const html = buildLoadingMarkup("季度損益", {
    containerClass: "h-full flex items-center justify-center",
    skeletonClass: "h-64 w-full rounded-lg",
  });

  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /季度損益載入中/);
  assert.match(html, /class="skeleton h-64 w-full rounded-lg"/);
});

test("escapeHtml neutralizes text before it reaches innerHTML", () => {
  assert.equal(
    escapeHtml('<script>alert("x")</script> & test'),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; test",
  );
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
