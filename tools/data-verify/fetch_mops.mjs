#!/usr/bin/env node
import { parseArgs, splitList } from "./lib/cli.mjs";
import { SAMPLE_TICKERS } from "./lib/contract.mjs";
import { rowsToCsv } from "./lib/compare.mjs";
import { defaultReportPath, writeTextFile } from "./lib/report_io.mjs";

const MOPS_MANUAL_FIELDS = Object.freeze([
  ["company_profile", "公司名稱"],
  ["company_profile", "董事長"],
  ["company_profile", "實收資本額"],
  ["monthly_sales", "單月合併營收"],
  ["quarterly_income", "營業收入淨額"],
  ["quarterly_income", "每股稅後盈餘"],
  ["quarterly_balance_sheet", "每股淨值"],
  ["quarterly_cashflow", "營業活動現金流量"],
  ["quarterly_cashflow", "自由現金流量"],
  ["dividend_policy", "現金股利合計"],
  ["dividend_policy", "股票股利合計"],
  ["insider_holding", "董監持股比例"],
  ["insider_holding", "董監設質比例"],
]);

export function buildMopsManualTemplate(tickers = SAMPLE_TICKERS) {
  return tickers.flatMap((ticker) =>
    MOPS_MANUAL_FIELDS.map(([source, field]) => ({
      ticker,
      source,
      period_or_date: "",
      field,
      official_value: "",
      public_url: "",
      captured_at: "",
      note: "",
    })),
  );
}

async function main() {
  const args = parseArgs();
  const tickers = splitList(args.tickers ?? args.ticker, SAMPLE_TICKERS);
  const outputPath = args.out || defaultReportPath("manual-mops.csv");
  const rows = buildMopsManualTemplate(tickers);
  await writeTextFile(
    outputPath,
    rowsToCsv(rows, [
      "ticker",
      "source",
      "period_or_date",
      "field",
      "official_value",
      "public_url",
      "captured_at",
      "note",
    ]),
  );
  console.log(`Wrote ${outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
