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
  buildInstitutionalComparison,
  buildProfileComparison,
  buildTierAComparisons,
  bwibbuDateToIso,
  renderMarkdownReport,
  resultRow,
  runTierAComparison,
  selectDottdotQuoteForDate,
} from "../tools/data-verify/compare_tier_a.mjs";
import {
  buildDottdotQueryUrl,
  buildTwseStockDayUrl,
  normalizeBwibbuRow,
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
  assert.equal(
    DOTTDOT_DATASETS.find((dataset) => dataset.key === "stats").table,
    "md_cm_ta_dailystatistics",
  );
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

test("TWSE BWIBBU rows preserve date, close price, and dividend year", () => {
  assert.equal(bwibbuDateToIso("20260505"), "2026-05-05");
  assert.equal(bwibbuDateToIso("115/05/05"), "2026-05-05");
  assert.equal(bwibbuDateToIso("2026-05-05"), "2026-05-05");

  assert.deepEqual(
    normalizeBwibbuRow({
      Date: "20260505",
      Code: "2330",
      Name: "台積電",
      ClosePrice: "1,000.00",
      DividendYear: "114",
      DividendYield: "5.50",
      PEratio: "20.1",
      PBratio: "8.2",
      FiscalYearQuarter: "115/1",
    }),
    {
      date: "2026-05-05",
      code: "2330",
      name: "台積電",
      closePrice: 1000,
      dividendYear: "114",
      dividendYield: 5.5,
      pe: 20.1,
      pb: 8.2,
      fiscalYearQuarter: "115/1",
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
  assert.equal(
    classifyMismatch(result, "date_mismatch").classification,
    "date_mismatch",
  );
  assert.throws(() => classifyMismatch(result, "unknown"));
});

test("Tier A result rows preserve classification and reason", () => {
  const row = resultRow(
    {
      id: "quotes.pb",
      label: "股價淨值比",
      status: "fail",
      classification: "rounding",
      reason: "official source rounds to two decimals",
      dottdotValue: 8.21,
      officialValue: 8.2,
      dottdotComparable: 8.21,
      officialComparable: 8.2,
      diff: 0.01,
      tolerance: 0.001,
    },
    { ticker: "2330", date: "2026-05-05", source: "TWSE BWIBBU_d" },
  );

  assert.equal(row.classification, "rounding");
  assert.equal(row.reason, "official source rounds to two decimals");
  assert.equal(row.needs_explanation, "no");
});

test("Tier A comparisons skip BWIBBU fields when official and quote dates differ", () => {
  const rows = buildTierAComparisons({
    ticker: "2330",
    targetDate: "2026-05-05",
    dottdotQuote: {
      日期: "2026-05-05",
      開盤價: 100,
      最高價: 105,
      最低價: 99,
      收盤價: 100,
      漲跌: 1,
      成交量_股: 1000,
      本益比4: 20,
      股價淨值比: 8,
      殖利率: 99,
    },
    twseQuote: {
      date: "2026-05-05",
      open: 100,
      high: 105,
      low: 99,
      close: 100,
      change: 1,
      tradeVolume: 1000,
    },
    bwibbuRow: {
      date: "2026-05-04",
      dividendYield: 6,
      pe: 20,
      pb: 8,
    },
    dottdotDividendRows: [{ 年季: "202501", 現金股利合計: 6 }],
  });

  const bwibbuRows = rows.filter((row) => row.source === "TWSE BWIBBU_d");
  assert.equal(bwibbuRows.length, 3);
  assert.ok(
    bwibbuRows.every(
      (row) =>
        row.status === "skipped_date_mismatch" &&
        row.classification === "date_mismatch" &&
        row.needs_explanation === "no",
    ),
  );
});

test("Tier A dividend yield comparison rebuilds the frontend value from annual cash dividend", () => {
  const rows = buildTierAComparisons({
    ticker: "2330",
    targetDate: "2026-05-05",
    dottdotQuote: {
      日期: "2026-05-05",
      開盤價: 100,
      最高價: 105,
      最低價: 99,
      收盤價: 100,
      漲跌: 1,
      成交量_股: 1000,
      本益比4: 20,
      股價淨值比: 8,
      殖利率: 99,
    },
    twseQuote: {
      date: "2026-05-05",
      open: 100,
      high: 105,
      low: 99,
      close: 100,
      change: 1,
      tradeVolume: 1000,
    },
    bwibbuRow: {
      date: "2026-05-05",
      dividendYield: 6,
      pe: 20,
      pb: 8,
    },
    dottdotDividendRows: [
      { 年季: "202501", 現金股利合計: 3 },
      { 年季: "202502", 現金股利合計: 3 },
    ],
  });

  const yieldRow = rows.find((row) => row.id === "quotes.dividend_yield");
  assert.equal(yieldRow.status, "pass");
  assert.equal(yieldRow.dottdot_value, 6);
  assert.equal(yieldRow.dottdot_comparable, 6);
});

test("Tier A requested-date quote selection does not silently fall back to latest", () => {
  const { quote, targetDate, missingRequestedDate } = selectDottdotQuoteForDate(
    [
      { 日期: "2026-05-06", 收盤價: 120 },
      { 日期: "2026-05-05", 收盤價: 100 },
    ],
    "2026-05-05",
  );

  assert.equal(targetDate, "2026-05-05");
  assert.equal(quote["收盤價"], 100);
  assert.equal(missingRequestedDate, false);

  const missing = selectDottdotQuoteForDate(
    [{ 日期: "2026-05-06", 收盤價: 120 }],
    "2026-05-05",
  );
  assert.equal(missing.targetDate, "2026-05-05");
  assert.equal(missing.quote, null);
  assert.equal(missing.missingRequestedDate, true);
});

test("Tier A comparison runner fetches dividend policy and uses the requested quote row", async () => {
  const fetchedTables = [];
  const fetchDottdot = async (tableName) => {
    fetchedTables.push(tableName);
    if (tableName === "md_cm_ta_dailyquotes") {
      return {
        data: [
          {
            日期: "2026-05-06",
            開盤價: 120,
            最高價: 125,
            最低價: 119,
            收盤價: 120,
            漲跌: 20,
            成交量_股: 1200,
            本益比4: 24,
            股價淨值比: 9,
          },
          {
            日期: "2026-05-05",
            開盤價: 100,
            最高價: 105,
            最低價: 99,
            收盤價: 100,
            漲跌: 1,
            成交量_股: 1000,
            本益比4: 20,
            股價淨值比: 8,
          },
        ],
      };
    }
    if (tableName === "md_cm_ot_dividendpolicy") {
      return {
        data: [
          { 年季: "202501", 現金股利合計: 3 },
          { 年季: "202502", 現金股利合計: 3 },
        ],
      };
    }
    return { data: [] };
  };

  const result = await runTierAComparison({
    ticker: "2330",
    date: "2026-05-05",
    fetchDottdot,
    fetchStockDay: async (_ticker, date) => {
      assert.equal(date, "2026-05-05");
      return {
        data: [
          [
            "115/05/05",
            "1,000",
            "100,000",
            "100.00",
            "105.00",
            "99.00",
            "100.00",
            "+1.00",
            "10",
          ],
        ],
      };
    },
    fetchBwibbu: async () => [
      {
        Date: "20260505",
        Code: "2330",
        ClosePrice: "100.00",
        DividendYield: "6.00",
        PEratio: "20.00",
        PBratio: "8.00",
      },
    ],
    fetchMonthlySales: async () => [],
    fetchCompanyList: async () => [],
    fetchT86Payload: async () => ({ data: [] }),
  });

  assert.ok(fetchedTables.includes("md_cm_ot_dividendpolicy"));
  assert.equal(result.date, "2026-05-05");
  assert.equal(
    result.rows.find((row) => row.id === "quotes.close").dottdot_value,
    100,
  );
  assert.equal(
    result.rows.find((row) => row.id === "quotes.dividend_yield").status,
    "pass",
  );
});

test("Tier A comparisons classify requested-date missing quote rows as date mismatch", () => {
  const rows = buildTierAComparisons({
    ticker: "2330",
    targetDate: "2026-05-05",
    dottdotQuote: null,
    twseQuote: null,
    bwibbuRow: null,
    dottdotDividendRows: [],
  });

  assert.equal(rows.length, 9);
  assert.ok(
    rows.every(
      (row) =>
        row.status === "missing" &&
        row.classification === "date_mismatch" &&
        row.reason.includes("2026-05-05"),
    ),
  );
});

test("Tier A markdown report includes classification and reason columns", () => {
  const markdown = renderMarkdownReport({
    ticker: "2330",
    date: "2026-05-05",
    rows: [
      {
        id: "quotes.volume_shares",
        label: "成交量（股）",
        status: "missing",
        classification: "date_mismatch",
        reason: "requested date not present in dottdot quotes",
        dottdot_value: "",
        official_value: "",
        diff: null,
        tolerance: 0,
        needs_explanation: "no",
      },
    ],
  });

  assert.match(
    markdown,
    /\| id \| label \| status \| classification \| reason \|/,
  );
  assert.match(markdown, /date_mismatch/);
  assert.match(markdown, /requested date not present/);
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
  assert.equal(
    computeShareholderMidTier({ above400: 61.2, below100: 18.3 }),
    20.5,
  );
});

function makeQuoteFixture(volumeShares) {
  return {
    dottdotQuote: {
      日期: "2026-05-06",
      開盤價: 2250,
      最高價: 2270,
      最低價: 2240,
      收盤價: 2250,
      漲跌: -25,
      成交量_股: volumeShares,
      本益比4: 34,
      股價淨值比: 10.77,
    },
    twseQuote: {
      date: "2026-05-06",
      open: 2250,
      high: 2270,
      low: 2240,
      close: 2250,
      change: -25,
      tradeVolume: 26644983,
    },
    bwibbuRow: {
      date: "2026-05-06",
      pe: 33.97,
      pb: 10.77,
      dividendYield: 0.98,
    },
    dottdotDividendRows: [{ 年度: "2025", 年度現金股利: 22 }],
  };
}

test("Tier A volume_shares fail is classified as date_mismatch (intraday delay)", () => {
  const rows = buildTierAComparisons({
    ticker: "2330",
    ...makeQuoteFixture(24233983), // dottdot 比 TWSE 少 ~2.4M 股 → 在門檻內、方向正確
    isLiveLatestMode: true,
  });
  const volume = rows.find((row) => row.id === "quotes.volume_shares");
  assert.equal(volume.status, "fail");
  assert.equal(volume.classification, "date_mismatch");
  assert.match(volume.reason, /盤後/);
  assert.equal(volume.needs_explanation, "no");
});

test("Tier A volume_shares fail does NOT auto-classify when --date is specified (historical mode)", () => {
  const rows = buildTierAComparisons({
    ticker: "2330",
    ...makeQuoteFixture(24233983),
    isLiveLatestMode: false, // 指定 --date 後關閉自動分類
  });
  const volume = rows.find((row) => row.id === "quotes.volume_shares");
  assert.equal(volume.status, "fail");
  assert.equal(volume.classification, "");
  assert.equal(volume.needs_explanation, "yes");
});

test("Tier A volume_shares fail does NOT auto-classify when diff exceeds intraday threshold", () => {
  // 假設 dottdot 顯示 1/1000（單位錯）→ 比 TWSE 少 ~26.6M 股，超過 10M 門檻
  const rows = buildTierAComparisons({
    ticker: "2330",
    ...makeQuoteFixture(26644),
    isLiveLatestMode: true,
  });
  const volume = rows.find((row) => row.id === "quotes.volume_shares");
  assert.equal(volume.status, "fail");
  assert.equal(volume.classification, "");
  assert.equal(volume.needs_explanation, "yes");
});

test("Tier A volume_shares fail does NOT auto-classify when dottdot shows MORE than TWSE", () => {
  // 反向：dottdot 多 1M 股 → 不是「盤後延遲」典型方向
  const rows = buildTierAComparisons({
    ticker: "2330",
    ...makeQuoteFixture(27644983),
    isLiveLatestMode: true,
  });
  const volume = rows.find((row) => row.id === "quotes.volume_shares");
  assert.equal(volume.status, "fail");
  assert.equal(volume.classification, "");
  assert.equal(volume.needs_explanation, "yes");
});

test("Tier A buildInstitutionalComparison emits exactly 3 rows with unique ids (no duplicates)", async () => {
  const t86Payload = {
    data: [
      [
        "2330",
        "台積電",
        "0",
        "0",
        "9111968",
        "0",
        "0",
        "0",
        "0",
        "0",
        "1495677",
        "377653",
      ],
    ],
  };
  const rows = await buildInstitutionalComparison({
    ticker: "2330",
    dottdotForeignLatest: { 日期: "2026-05-06", 外資買賣超: 9111.968 },
    dottdotTrustLatest: { 日期: "2026-05-06", 投信買賣超: 1495.677 },
    dottdotBrokerLatest: { 日期: "2026-05-06", 自營商買賣超: 377.653 },
    fetchT86: async () => t86Payload,
    isLiveLatestMode: true,
    latestKnownDate: "2026-05-06",
  });
  assert.equal(rows.length, 3, "expected exactly 3 institutional rows");
  const ids = rows.map((row) => row.id);
  assert.deepEqual(
    new Set(ids).size,
    ids.length,
    `institutional ids should be unique, got ${JSON.stringify(ids)}`,
  );
  assert.deepEqual(ids.sort(), [
    "fund.broker_net",
    "fund.foreign_net",
    "fund.trust_net",
  ]);
});

test("Tier A institutional missing rows are classified as date_mismatch in live latest mode", async () => {
  const rows = await buildInstitutionalComparison({
    ticker: "2330",
    dottdotForeignLatest: null,
    dottdotTrustLatest: { 日期: "2026-05-06", 投信買賣超: 100 },
    dottdotBrokerLatest: null,
    fetchT86: async () => ({ data: [] }),
    isLiveLatestMode: true,
    latestKnownDate: "2026-05-06",
  });
  const foreign = rows.find((row) => row.id === "fund.foreign_net");
  assert.equal(foreign.status, "missing");
  assert.equal(foreign.classification, "date_mismatch");
  assert.match(foreign.reason, /尚未公布|T\+1/);
  assert.equal(foreign.needs_explanation, "no");

  const trust = rows.find((row) => row.id === "fund.trust_net");
  assert.equal(trust.status, "missing"); // T86 empty → no row found
  assert.equal(trust.classification, "date_mismatch");
  assert.equal(trust.needs_explanation, "no");
});

test("Tier A institutional missing does NOT auto-classify in historical mode", async () => {
  const rows = await buildInstitutionalComparison({
    ticker: "2330",
    dottdotForeignLatest: null,
    dottdotTrustLatest: { 日期: "2026-04-15", 投信買賣超: 100 },
    dottdotBrokerLatest: null,
    fetchT86: async () => ({ data: [] }),
    isLiveLatestMode: false,
    latestKnownDate: "2026-05-06",
  });
  const foreign = rows.find((row) => row.id === "fund.foreign_net");
  assert.equal(foreign.classification, "");
  assert.equal(foreign.needs_explanation, "yes");
});

test("Tier A fund fail does NOT auto-classify when dottdot date is older than latestKnownDate", async () => {
  // 歷史日期：dottdot row 是 2026-04-15、最新交易日是 5/6 → 不在 T+1 修正窗
  const t86Payload = {
    data: [["2330", "台積電", "1000", "500", "500"]],
  };
  const rows = await buildInstitutionalComparison({
    ticker: "2330",
    dottdotForeignLatest: { 日期: "2026-04-15", 外資買賣超: 1.0 },
    dottdotTrustLatest: null,
    dottdotBrokerLatest: null,
    fetchT86: async () => t86Payload,
    isLiveLatestMode: true,
    latestKnownDate: "2026-05-06",
  });
  const foreign = rows.find((row) => row.id === "fund.foreign_net");
  assert.equal(foreign.status, "fail");
  assert.equal(foreign.classification, "");
  assert.equal(foreign.needs_explanation, "yes");
});

test("Tier A fund fail does NOT auto-classify when absDiff exceeds T+1 correction threshold", async () => {
  // 數量級錯：dottdot 1000 張 → 1M 股 vs TWSE 100M 股 → diff 99M 股，遠超 1M 門檻
  const t86Payload = {
    data: [["2330", "台積電", "0", "0", "100000000", "0", "0", "0"]],
  };
  const rows = await buildInstitutionalComparison({
    ticker: "2330",
    dottdotForeignLatest: { 日期: "2026-05-06", 外資買賣超: 1000 },
    dottdotTrustLatest: null,
    dottdotBrokerLatest: null,
    fetchT86: async () => t86Payload,
    isLiveLatestMode: true,
    latestKnownDate: "2026-05-06",
  });
  const foreign = rows.find((row) => row.id === "fund.foreign_net");
  assert.equal(foreign.status, "fail");
  assert.equal(foreign.classification, "");
  assert.equal(foreign.needs_explanation, "yes");
});

test("Tier A profile.industry_match fail is classified as endpoint_semantics", () => {
  const rows = buildProfileComparison({
    ticker: "2330",
    dottdotProfile: {
      公司名稱: "台灣積體電路製造股份有限公司",
      產業名稱: "電子–半導體",
    },
    twseCompanyRow: {
      公司名稱: "台灣積體電路製造股份有限公司",
      產業別: "24",
    },
  });
  const industry = rows.find((row) => row.id === "profile.industry_match");
  assert.equal(industry.status, "fail");
  assert.equal(industry.classification, "endpoint_semantics");
  assert.match(industry.reason, /產業代號/);
  assert.equal(industry.needs_explanation, "no");

  const companyName = rows.find(
    (row) => row.id === "profile.company_name_match",
  );
  assert.equal(companyName.status, "pass");
  assert.equal(companyName.classification, "");
});
