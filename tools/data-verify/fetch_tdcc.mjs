#!/usr/bin/env node
import { parseArgs, splitList } from "./lib/cli.mjs";
import { SAMPLE_TICKERS } from "./lib/contract.mjs";
import { rowsToCsv } from "./lib/compare.mjs";
import { defaultReportPath, writeTextFile } from "./lib/report_io.mjs";

const TDCC_FIELDS = Object.freeze([
  "1000張以上佔集保比率",
  "400張以上佔集保比率",
  "100張以下佔集保比率",
  "100~400張反推比率",
]);

export function buildTdccManualTemplate(tickers = SAMPLE_TICKERS) {
  return tickers.flatMap((ticker) =>
    TDCC_FIELDS.map((field) => ({
      ticker,
      week_date: "",
      field,
      official_value_percent: "",
      public_url: "https://www.tdcc.com.tw/portal/zh/smWeb/qryStock",
      captured_at: "",
      note: "",
    })),
  );
}

async function main() {
  const args = parseArgs();
  const tickers = splitList(args.tickers ?? args.ticker, SAMPLE_TICKERS);
  const outputPath = args.out || defaultReportPath("manual-tdcc.csv");
  const rows = buildTdccManualTemplate(tickers);
  await writeTextFile(
    outputPath,
    rowsToCsv(rows, [
      "ticker",
      "week_date",
      "field",
      "official_value_percent",
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
