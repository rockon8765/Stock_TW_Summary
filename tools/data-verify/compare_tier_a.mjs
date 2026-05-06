#!/usr/bin/env node
import { parseArgs } from "./lib/cli.mjs";
import {
  TOLERANCES,
} from "./lib/contract.mjs";
import {
  compareNumeric,
  lotsToShares,
  rowsToCsv,
  toNumber,
} from "./lib/compare.mjs";
import {
  fetchDottdotTable,
  fetchTwseBwibbu,
  fetchTwseCompanyList,
  fetchTwseMonthlySales,
  fetchTwseStockDay,
  fetchTwseT86,
  findTwseCompanyRow,
  findTwseMonthlySalesRow,
  findTwseT86Row,
  normalizeBwibbuPayload,
  normalizeTwseStockDayPayload,
} from "./lib/fetchers.mjs";
import {
  defaultReportPath,
  reportTimestamp,
  writeTextFile,
} from "./lib/report_io.mjs";

function sortDescByDate(rows, field = "日期") {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) =>
    String(right?.[field] ?? "").localeCompare(String(left?.[field] ?? "")),
  );
}

function resolveQuoteVolume(row) {
  if (row?.["成交量_股"] != null) return row["成交量_股"];
  if (row?.["成交量"] != null) return toNumber(row["成交量"]) * 1000;
  return null;
}

function resultRow(result, { ticker, date, source }) {
  const needsExplanation = ["fail", "missing"].includes(result.status);
  return {
    ticker,
    date,
    id: result.id,
    label: result.label,
    source,
    status: result.status,
    needs_explanation: needsExplanation ? "yes" : "no",
    classification: "",
    reason: "",
    dottdot_value: result.dottdotValue,
    official_value: result.officialValue,
    dottdot_comparable: result.dottdotComparable,
    official_comparable: result.officialComparable,
    diff: result.diff,
    tolerance: result.tolerance,
  };
}

export function buildTierAComparisons({
  ticker,
  dottdotQuote,
  twseQuote,
  bwibbuRow,
}) {
  const date = dottdotQuote?.["日期"] ?? "";
  const quoteChecks = [
    ["quotes.open", "開盤價", "開盤價", "open", TOLERANCES.price],
    ["quotes.high", "最高價", "最高價", "high", TOLERANCES.price],
    ["quotes.low", "最低價", "最低價", "low", TOLERANCES.price],
    ["quotes.close", "收盤價", "收盤價", "close", TOLERANCES.price],
    ["quotes.change", "漲跌", "漲跌", "change", TOLERANCES.price],
  ].map(([id, label, dottdotField, officialField, tolerance]) =>
    resultRow(
      compareNumeric({
        id,
        label,
        dottdotValue: dottdotQuote?.[dottdotField],
        officialValue: twseQuote?.[officialField],
        tolerance,
      }),
      { ticker, date, source: "TWSE STOCK_DAY" },
    ),
  );

  const volumeCheck = resultRow(
    compareNumeric({
      id: "quotes.volume_shares",
      label: "成交量（股）",
      dottdotValue: resolveQuoteVolume(dottdotQuote),
      officialValue: twseQuote?.tradeVolume,
      tolerance: TOLERANCES.shares,
    }),
    { ticker, date, source: "TWSE STOCK_DAY" },
  );

  const bwibbuChecks = [
    ["quotes.pe4", "本益比4", "本益比4", "pe", TOLERANCES.pe],
    ["quotes.pb", "股價淨值比", "股價淨值比", "pb", TOLERANCES.pb],
    [
      "quotes.dividend_yield",
      "殖利率",
      "殖利率",
      "dividendYield",
      TOLERANCES.ratioPercentPoint,
    ],
  ].map(([id, label, dottdotField, officialField, tolerance]) =>
    resultRow(
      compareNumeric({
        id,
        label,
        dottdotValue: dottdotQuote?.[dottdotField],
        officialValue: bwibbuRow?.[officialField],
        tolerance,
      }),
      { ticker, date, source: "TWSE BWIBBU_d" },
    ),
  );

  return [...quoteChecks, volumeCheck, ...bwibbuChecks];
}

export function buildMonthlySalesComparison({
  ticker,
  dottdotSalesLatest,
  twseSalesRow,
}) {
  if (!dottdotSalesLatest || !twseSalesRow) return [];
  const period = String(dottdotSalesLatest?.["年月"] ?? "");
  const twsePeriod = String(twseSalesRow?.["資料年月"] ?? "");
  // TWSE 期別格式為民國年(3位) + 月(2位)，例 "11503" = 2026/03
  const twsePeriodAd =
    twsePeriod.length === 5
      ? `${Number(twsePeriod.slice(0, 3)) + 1911}${twsePeriod.slice(3, 5)}`
      : twsePeriod;
  const periodAligned = period === twsePeriodAd;
  const meta = {
    dottdot_period: period,
    twse_period: twsePeriod,
    twse_period_ad: twsePeriodAd,
    periods_aligned: periodAligned,
  };
  // 期別不一致時不做數值比對，標為 missing 並在 reason hint 補說明
  if (!periodAligned) {
    return [
      {
        ticker,
        date: period,
        id: "sales.period_alignment",
        label: "月營收期別對齊",
        source: "TWSE OpenAPI t187ap05_L",
        status: "missing",
        needs_explanation: "yes",
        classification: "date_mismatch",
        reason: `dottdot=${period}, TWSE=${twsePeriodAd} (TWSE 公開源尚未更新到 dottdot 最新月)`,
        dottdot_value: period,
        official_value: twsePeriodAd,
        dottdot_comparable: null,
        official_comparable: null,
        diff: null,
        tolerance: 0,
      },
    ];
  }
  const checks = [
    [
      "sales.monthly_revenue",
      "單月合併營收",
      "單月合併營收",
      "營業收入-當月營收",
      0.5,
    ],
    [
      "sales.cumulative_revenue",
      "累計合併營收",
      "累計合併營收",
      "累計營業收入-當月累計營收",
      0.5,
    ],
    [
      "sales.mom_pct",
      "單月合併營收月變動",
      "單月合併營收月變動",
      "營業收入-上月比較增減(%)",
      0.05,
    ],
    [
      "sales.yoy_pct",
      "單月合併營收年成長",
      "單月合併營收年成長",
      "營業收入-去年同月增減(%)",
      0.05,
    ],
    [
      "sales.cumulative_yoy_pct",
      "累計合併營收成長",
      "累計合併營收成長",
      "累計營業收入-前期比較增減(%)",
      0.05,
    ],
  ];
  return checks.map(([id, label, dottdotField, twseField, tolerance]) =>
    resultRow(
      compareNumeric({
        id,
        label,
        dottdotValue: dottdotSalesLatest?.[dottdotField],
        officialValue: twseSalesRow?.[twseField],
        tolerance,
        meta,
      }),
      {
        ticker,
        date: period,
        source: "TWSE OpenAPI t187ap05_L",
      },
    ),
  );
}

export async function buildInstitutionalComparison({
  ticker,
  dottdotForeignLatest,
  dottdotTrustLatest,
  dottdotBrokerLatest,
  fetchT86 = (date) =>
    import("./lib/fetchers.mjs").then(({ fetchTwseT86 }) => fetchTwseT86(date)),
}) {
  // T86 column reference (TWSE):
  //   col 4  = 外陸資買賣超 (excl 外資自營商)
  //   col 7  = 外資自營商買賣超
  //   col 10 = 投信買賣超
  //   col 11 = 自營商買賣超 (合計：自行+避險)
  // 每類法人用「自己最新的 dottdot 日期」抓對應日期的 T86，避免日期錯位（外資常 T+1 延遲，投信即時）
  const investors = [
    {
      id: "fund.foreign_net",
      label: "外資買賣超（張→股）",
      dottdotRow: dottdotForeignLatest,
      dottdotField: "外資買賣超",
      twseColIndex: 4,
    },
    {
      id: "fund.trust_net",
      label: "投信買賣超（張→股）",
      dottdotRow: dottdotTrustLatest,
      dottdotField: "投信買賣超",
      twseColIndex: 10,
    },
    {
      id: "fund.broker_net",
      label: "自營商買賣超（張→股）",
      dottdotRow: dottdotBrokerLatest,
      dottdotField: "自營商買賣超",
      twseColIndex: 11,
    },
  ];

  const t86CacheByDate = new Map();
  const rows = [];
  for (const inv of investors) {
    const date = inv.dottdotRow?.["日期"];
    if (!date) {
      rows.push(
        resultRow(
          compareNumeric({
            id: inv.id,
            label: inv.label,
            dottdotValue: null,
            officialValue: null,
            tolerance: 0,
            meta: { reason: "dottdot row missing for this investor" },
          }),
          { ticker, date: "", source: "TWSE T86" },
        ),
      );
      continue;
    }
    if (!t86CacheByDate.has(date)) {
      try {
        const payload = await fetchT86(date);
        t86CacheByDate.set(date, payload);
      } catch (error) {
        t86CacheByDate.set(date, null);
      }
    }
    const t86Payload = t86CacheByDate.get(date);
    const t86Row = t86Payload
      ? (t86Payload.data ?? []).find(
          (row) =>
            Array.isArray(row) && String(row[0]).trim() === String(ticker),
        )
      : null;
    const officialValue = t86Row ? toNumber(t86Row[inv.twseColIndex]) : null;
    rows.push(
      resultRow(
        compareNumeric({
          id: inv.id,
          label: inv.label,
          dottdotValue: inv.dottdotRow?.[inv.dottdotField],
          officialValue,
          transformDottdot: (value) => lotsToShares(value),
          tolerance: 0,
          meta: {
            dottdot_date: date,
            t86_date_used: date,
            t86_available: t86Row != null,
          },
        }),
        { ticker, date, source: "TWSE T86" },
      ),
    );
  }
  return rows;
}

export function buildProfileComparison({ ticker, dottdotProfile, twseCompanyRow }) {
  if (!dottdotProfile || !twseCompanyRow) return [];
  const meta = {
    dottdot_company_name: dottdotProfile?.["公司名稱"],
    twse_company_name: twseCompanyRow?.["公司名稱"],
  };
  const checks = [
    [
      "profile.industry_match",
      "產業名稱（字串相等）",
      dottdotProfile?.["產業名稱"],
      twseCompanyRow?.["產業別"],
    ],
    [
      "profile.company_name_match",
      "公司名稱（字串相等）",
      dottdotProfile?.["公司名稱"],
      twseCompanyRow?.["公司名稱"],
    ],
  ];

  return checks.map(([id, label, dottdotValue, officialValue]) => {
    const status =
      dottdotValue == null || officialValue == null
        ? "missing"
        : String(dottdotValue).trim() === String(officialValue).trim()
          ? "pass"
          : "fail";
    return resultRow(
      {
        id,
        label,
        status,
        dottdotValue,
        officialValue,
        dottdotComparable: dottdotValue,
        officialComparable: officialValue,
        diff: status === "pass" ? 0 : null,
        absDiff: status === "pass" ? 0 : null,
        tolerance: 0,
        meta,
      },
      { ticker, date: "", source: "TWSE OpenAPI t187ap03_L" },
    );
  });
}

function renderMarkdownReport({ ticker, date, rows }) {
  const failed = rows.filter((row) => row.needs_explanation === "yes");
  return `# Tier A Verification Report

- generated_at: ${new Date().toISOString()}
- ticker: ${ticker}
- date: ${date}
- scope: TWSE quote / BWIBBU fields currently implemented
- unexplained_mismatch_count: ${failed.length}

| id | label | status | dottdot | official | diff | tolerance | needs explanation |
|----|-------|--------|---------|----------|------|-----------|-------------------|
${rows
  .map(
    (row) =>
      `| ${row.id} | ${row.label} | ${row.status} | ${row.dottdot_value ?? ""} | ${row.official_value ?? ""} | ${row.diff ?? ""} | ${row.tolerance ?? ""} | ${row.needs_explanation} |`,
  )
  .join("\n")}

> Any row with \`needs_explanation = yes\` must be manually classified as one of the accepted mismatch categories before sign-off.
`;
}

export async function runTierAComparison({
  ticker = "2330",
  date,
  apiKey = process.env.DOTTDOT_API_KEY || "guest",
} = {}) {
  const [
    dottdotQuotes,
    dottdotSales,
    dottdotProfile,
    dottdotForeign,
    dottdotTrust,
    dottdotBroker,
  ] = await Promise.all([
    fetchDottdotTable("md_cm_ta_dailyquotes", {
      ticker,
      params: { page_size: 5 },
      apiKey,
    }),
    fetchDottdotTable("md_cm_fi_monthsales", {
      ticker,
      params: { page_size: 3 },
      apiKey,
    }).catch((error) => ({ error: error.message, data: [] })),
    fetchDottdotTable("bd_cm_companyprofile", {
      ticker,
      params: { page_size: 1 },
      apiKey,
    }).catch((error) => ({ error: error.message, data: [] })),
    fetchDottdotTable("md_cm_fd_foreigninsttrading", {
      ticker,
      params: { page_size: 5 },
      apiKey,
    }).catch((error) => ({ error: error.message, data: [] })),
    fetchDottdotTable("md_cm_fd_investmenttrusttrading", {
      ticker,
      params: { page_size: 5 },
      apiKey,
    }).catch((error) => ({ error: error.message, data: [] })),
    fetchDottdotTable("md_cm_fd_brokertrading", {
      ticker,
      params: { page_size: 5 },
      apiKey,
    }).catch((error) => ({ error: error.message, data: [] })),
  ]);

  const latestQuote = sortDescByDate(dottdotQuotes.data)[0] ?? null;
  const targetDate = date || latestQuote?.["日期"];
  if (!targetDate) throw new Error("No dottdot quote date available");

  const twseStockDay = await fetchTwseStockDay(ticker, targetDate);
  const twseRows = normalizeTwseStockDayPayload(twseStockDay);
  const twseQuote = twseRows.find((row) => row.date === targetDate) ?? null;
  const bwibbu = normalizeBwibbuPayload(await fetchTwseBwibbu());
  const bwibbuRow = bwibbu.find((row) => row.code === ticker) ?? null;

  const twseSalesPayload = await fetchTwseMonthlySales().catch(() => null);
  const twseSalesRow = twseSalesPayload
    ? findTwseMonthlySalesRow(twseSalesPayload, ticker)
    : null;

  const twseCompanyPayload = await fetchTwseCompanyList().catch(() => null);
  const twseCompanyRow = twseCompanyPayload
    ? findTwseCompanyRow(twseCompanyPayload, ticker)
    : null;

  const dottdotForeignLatest = sortDescByDate(dottdotForeign.data)[0] ?? null;
  const dottdotTrustLatest = sortDescByDate(dottdotTrust.data)[0] ?? null;
  const dottdotBrokerLatest = sortDescByDate(dottdotBroker.data)[0] ?? null;

  const dottdotSalesLatest = (() => {
    const rows = Array.isArray(dottdotSales.data) ? dottdotSales.data : [];
    return rows
      .slice()
      .sort((a, b) => String(b?.["年月"]).localeCompare(String(a?.["年月"])))[0] ?? null;
  })();
  const dottdotProfileRow = Array.isArray(dottdotProfile.data)
    ? dottdotProfile.data[0]
    : null;

  const rows = [
    ...buildTierAComparisons({
      ticker,
      dottdotQuote: latestQuote,
      twseQuote,
      bwibbuRow,
    }),
    ...buildMonthlySalesComparison({
      ticker,
      dottdotSalesLatest,
      twseSalesRow,
    }),
    ...(await buildInstitutionalComparison({
      ticker,
      dottdotForeignLatest,
      dottdotTrustLatest,
      dottdotBrokerLatest,
      fetchT86: (date) => fetchTwseT86(date),
    })),
    ...buildProfileComparison({
      ticker,
      dottdotProfile: dottdotProfileRow,
      twseCompanyRow,
    }),
  ];

  return {
    ticker,
    date: targetDate,
    rows,
  };
}

async function main() {
  const args = parseArgs();
  const ticker = args.ticker || "2330";
  const result = await runTierAComparison({
    ticker,
    date: args.date,
    apiKey: args.apiKey || process.env.DOTTDOT_API_KEY || "guest",
  });
  const basename = `tier-a-${ticker}-${result.date}-${reportTimestamp()}`;
  const csvPath = args.csv || defaultReportPath(`${basename}.csv`);
  const mdPath = args.md || defaultReportPath(`${basename}.md`);
  const columns = [
    "ticker",
    "date",
    "id",
    "label",
    "source",
    "status",
    "needs_explanation",
    "classification",
    "reason",
    "dottdot_value",
    "official_value",
    "dottdot_comparable",
    "official_comparable",
    "diff",
    "tolerance",
  ];

  await writeTextFile(csvPath, rowsToCsv(result.rows, columns));
  await writeTextFile(mdPath, renderMarkdownReport(result));
  console.log(`Wrote ${csvPath}`);
  console.log(`Wrote ${mdPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
