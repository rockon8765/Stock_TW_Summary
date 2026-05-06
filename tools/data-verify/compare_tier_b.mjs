#!/usr/bin/env node
import { aggregateDividendsToAnnual } from "../../js/lib/dividend_aggregator.js";
import { parseArgs } from "./lib/cli.mjs";
import { fetchDottdotTable } from "./lib/fetchers.mjs";
import { rowsToCsv, toNumber } from "./lib/compare.mjs";
import {
  computeEpsTtmYoy,
  computeRollingRevenueYoy,
  computeShareholderMidTier,
} from "./lib/transforms.mjs";
import {
  defaultReportPath,
  reportTimestamp,
  writeTextFile,
} from "./lib/report_io.mjs";

function sortDesc(rows, field) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) =>
    String(right?.[field] ?? "").localeCompare(String(left?.[field] ?? "")),
  );
}

function latestAnnualEpsByYear(annualIsRows) {
  const byYear = new Map();
  for (const row of annualIsRows ?? []) {
    const year = String(row?.["年度"] ?? row?.["年季"] ?? "").slice(0, 4);
    const eps = toNumber(row?.["每股稅後盈餘"]);
    if (!year || eps == null) continue;
    byYear.set(year, eps);
  }
  return byYear;
}

function metricRow({
  ticker,
  id,
  label,
  source,
  period,
  rebuiltValue,
  formula,
  note = "",
}) {
  return {
    ticker,
    id,
    label,
    source,
    period,
    rebuilt_value: rebuiltValue,
    formula,
    status: rebuiltValue == null ? "missing_input" : "rebuilt",
    note,
  };
}

export async function runTierBRebuild({
  ticker = "2330",
  apiKey = process.env.DOTTDOT_API_KEY || "guest",
} = {}) {
  const [sales, income, shareholders, dividend, annualIs] = await Promise.all([
    fetchDottdotTable("md_cm_fi_monthsales", {
      ticker,
      params: { page_size: 24 },
      apiKey,
    }),
    fetchDottdotTable("md_cm_fi_is_quarterly", {
      ticker,
      params: { page_size: 14 },
      apiKey,
    }),
    fetchDottdotTable("md_cm_fd_stockholderstructure", {
      ticker,
      params: { page_size: 12 },
      apiKey,
    }),
    fetchDottdotTable("md_cm_ot_dividendpolicy", {
      ticker,
      params: { page_size: 40 },
      apiKey,
    }),
    fetchDottdotTable("md_cm_fi_is_annual", {
      ticker,
      params: { page_size: 10 },
      apiKey,
    }),
  ]);

  const latestSales = sortDesc(sales.data, "年月")[0] ?? null;
  const latestShareholders = sortDesc(shareholders.data, "日期")[0] ?? null;
  const annualDividends = aggregateDividendsToAnnual(dividend.data);
  const epsByYear = latestAnnualEpsByYear(annualIs.data);
  const latestDividend = annualDividends[0] ?? null;
  const latestDividendEps =
    latestDividend?.年度 != null ? epsByYear.get(String(latestDividend.年度)) : null;
  const annualPayoutRate =
    latestDividend?.年度現金股利 != null &&
    Number.isFinite(latestDividendEps) &&
    latestDividendEps !== 0
      ? (latestDividend.年度現金股利 / latestDividendEps) * 100
      : null;

  const rows = [
    metricRow({
      ticker,
      id: "sales.rolling_3m_yoy",
      label: "3M YoY",
      source: "md_cm_fi_monthsales",
      period: latestSales?.["年月"] ?? "",
      rebuiltValue:
        latestSales?.["年月"] != null
          ? computeRollingRevenueYoy(sales.data, latestSales["年月"], 3)
          : null,
      formula: "(sum current 3M - sum prior-year same 3M) / abs(prior-year same 3M) * 100",
    }),
    metricRow({
      ticker,
      id: "sales.ttm_12m_yoy",
      label: "12M TTM YoY",
      source: "md_cm_fi_monthsales",
      period: latestSales?.["年月"] ?? "",
      rebuiltValue:
        latestSales?.["年月"] != null
          ? computeRollingRevenueYoy(sales.data, latestSales["年月"], 12)
          : null,
      formula: "(sum latest 12M - sum prior 12M) / abs(prior 12M) * 100",
    }),
    metricRow({
      ticker,
      id: "income.eps_ttm_yoy",
      label: "EPS TTM YoY",
      source: "md_cm_fi_is_quarterly",
      period: sortDesc(income.data, "年季")[0]?.["年季"] ?? "",
      rebuiltValue: computeEpsTtmYoy(income.data),
      formula: "(sum latest 4Q EPS - sum previous 4Q EPS) / abs(previous 4Q EPS) * 100",
    }),
    metricRow({
      ticker,
      id: "shareholders.mid_100_400",
      label: "100~400 張 %",
      source: "md_cm_fd_stockholderstructure",
      period: latestShareholders?.["日期"] ?? latestShareholders?.["週別"] ?? "",
      rebuiltValue: computeShareholderMidTier({
        above400: latestShareholders?.["400張以上佔集保比率"],
        below100: latestShareholders?.["100張以下佔集保比率"],
      }),
      formula: "max(0, 100 - 400張以上佔比 - 100張以下佔比)",
    }),
    metricRow({
      ticker,
      id: "dividend.annual_cash",
      label: "年度現金股利",
      source: "md_cm_ot_dividendpolicy",
      period: latestDividend?.年度 ?? "",
      rebuiltValue: latestDividend?.年度現金股利 ?? null,
      formula: "sum same-year quarterly 現金股利合計",
    }),
    metricRow({
      ticker,
      id: "dividend.annual_payout_rate",
      label: "年度發放率",
      source: "md_cm_ot_dividendpolicy + md_cm_fi_is_annual",
      period: latestDividend?.年度 ?? "",
      rebuiltValue: annualPayoutRate,
      formula: "年度現金股利 / 年度 EPS * 100",
      note:
        latestDividendEps == null
          ? "Missing annual EPS for the dividend year"
          : "",
    }),
  ];

  return { ticker, rows };
}

function renderMarkdownReport({ ticker, rows }) {
  return `# Tier B Transform Rebuild Report

- generated_at: ${new Date().toISOString()}
- ticker: ${ticker}
- scope: implemented transform checks before external MOPS/TDCC reconciliation

| id | label | period | rebuilt value | status | formula |
|----|-------|--------|---------------|--------|---------|
${rows
  .map(
    (row) =>
      `| ${row.id} | ${row.label} | ${row.period ?? ""} | ${row.rebuilt_value ?? ""} | ${row.status} | ${row.formula} |`,
  )
  .join("\n")}

> These rows rebuild frontend transform inputs from dottdot raw data. Public-source reconciliation still depends on MOPS / TDCC manual capture or future automated fetchers.
`;
}

async function main() {
  const args = parseArgs();
  const ticker = args.ticker || "2330";
  const result = await runTierBRebuild({
    ticker,
    apiKey: args.apiKey || process.env.DOTTDOT_API_KEY || "guest",
  });
  const basename = `tier-b-${ticker}-${reportTimestamp()}`;
  const csvPath = args.csv || defaultReportPath(`${basename}.csv`);
  const mdPath = args.md || defaultReportPath(`${basename}.md`);
  const columns = [
    "ticker",
    "id",
    "label",
    "source",
    "period",
    "rebuilt_value",
    "formula",
    "status",
    "note",
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
