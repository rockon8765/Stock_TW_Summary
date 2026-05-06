import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DOTTDOT_DATASETS,
  SAMPLE_TICKERS,
  TIER_C_ITEMS,
} from "../tools/data-verify/lib/contract.mjs";
import {
  compareNumeric,
  classifyMismatch,
  lotsToShares,
} from "../tools/data-verify/lib/compare.mjs";
import {
  buildDottdotQueryUrl,
  buildTwseStockDayUrl,
  normalizeTwseStockDayRow,
} from "../tools/data-verify/lib/fetchers.mjs";
import {
  computeEpsTtmYoy,
  computeRollingRevenueYoy,
  computeShareholderMidTier,
} from "../tools/data-verify/lib/transforms.mjs";

test("data verification contract covers the 15 frontend dottdot datasets", () => {
  assert.equal(DOTTDOT_DATASETS.length, 15);
  assert.deepEqual(
    DOTTDOT_DATASETS.map((dataset) => dataset.key),
    [
      "quotes",
      "profile",
      "sales",
      "income",
      "bs",
      "dividend",
      "foreign",
      "trust",
      "broker",
      "shareholders",
      "cashflow",
      "stats",
      "insider",
      "annualIs",
      "annualBs",
    ],
  );
  assert.equal(DOTTDOT_DATASETS.find((dataset) => dataset.key === "stats").table, "md_cm_ta_dailystatistics");
  assert.ok(SAMPLE_TICKERS.includes("2330"));
  assert.ok(SAMPLE_TICKERS.includes("9999"));
});

test("Tier C artificial review list keeps all 15 non-public indicators", () => {
  assert.equal(TIER_C_ITEMS.length, 15);
  assert.equal(TIER_C_ITEMS.at(-1).id, "C15");
  assert.match(TIER_C_ITEMS.at(-1).label, /本益比/);
});

test("fetch URL builders use the corrected public endpoints", () => {
  const dottdotUrl = buildDottdotQueryUrl("md_cm_ta_dailyquotes", {
    apiKey: "fixture-key",
    params: { ticker: "2330", page_size: 2 },
  });

  assert.equal(
    dottdotUrl.toString(),
    "https://data.dottdot.com/api/v1/tables/md_cm_ta_dailyquotes/query?api_key=fixture-key&ticker=2330&page_size=2",
  );

  const twseUrl = buildTwseStockDayUrl("2330", "2026-05-05");
  assert.equal(twseUrl.origin, "https://www.twse.com.tw");
  assert.equal(twseUrl.pathname, "/rwd/zh/afterTrading/STOCK_DAY");
  assert.equal(twseUrl.searchParams.get("date"), "20260505");
  assert.equal(twseUrl.searchParams.get("stockNo"), "2330");
  assert.equal(twseUrl.searchParams.get("response"), "json");
});

test("TWSE STOCK_DAY rows normalize ROC dates, comma numbers, and price fields", () => {
  assert.deepEqual(
    normalizeTwseStockDayRow([
      "115/05/05",
      "2,636,000",
      "5,909,200,000",
      "2,250.00",
      "2,260.00",
      "2,230.00",
      "2,250.00",
      "+10.00",
      "1,234",
    ]),
    {
      date: "2026-05-05",
      tradeVolume: 2636000,
      tradeValue: 5909200000,
      open: 2250,
      high: 2260,
      low: 2230,
      close: 2250,
      change: 10,
      transactions: 1234,
    },
  );
});

test("numeric comparison can apply T86 lot-to-share conversion before exact comparison", () => {
  const result = compareNumeric({
    id: "institutional.foreign_net_buy",
    dottdotValue: 12.5,
    officialValue: 12500,
    transformDottdot: lotsToShares,
    tolerance: 0,
  });

  assert.equal(result.status, "pass");
  assert.equal(result.dottdotComparable, 12500);
  assert.equal(result.diff, 0);
});

test("mismatch classifier requires explicit categories for failed comparisons", () => {
  const result = compareNumeric({
    id: "quotes.close",
    dottdotValue: 2251,
    officialValue: 2250,
    tolerance: 0.01,
  });

  assert.equal(result.status, "fail");
  assert.equal(classifyMismatch(result, "date_mismatch").classification, "date_mismatch");
  assert.throws(() => classifyMismatch(result, "unknown"));
});

test("Tier B transforms rebuild rolling revenue, EPS TTM YoY, and shareholder mid tier", () => {
  const months = [
    "202603",
    "202602",
    "202601",
    "202512",
    "202511",
    "202510",
    "202509",
    "202508",
    "202507",
    "202506",
    "202505",
    "202504",
    "202503",
    "202502",
    "202501",
  ];
  const salesRows = months.map((month, index) => ({
    年月: month,
    單月合併營收: index < 12 ? 200 : 100,
  }));
  assert.equal(computeRollingRevenueYoy(salesRows, "202603", 3), 100);

  const incomeRows = [5, 5, 5, 5, 2.5, 2.5, 2.5, 2.5].map((eps, index) => ({
    年季: String(202504 - index).padStart(6, "0"),
    每股稅後盈餘: eps,
  }));
  assert.equal(computeEpsTtmYoy(incomeRows), 100);
  assert.equal(computeShareholderMidTier({ above400: 61.2, below100: 18.3 }), 20.5);
});
