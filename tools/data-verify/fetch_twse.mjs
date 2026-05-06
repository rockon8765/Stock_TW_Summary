#!/usr/bin/env node
import { parseArgs } from "./lib/cli.mjs";
import {
  fetchTwseBwibbu,
  fetchTwseStockDay,
  normalizeBwibbuPayload,
  normalizeTwseStockDayPayload,
} from "./lib/fetchers.mjs";
import {
  defaultReportPath,
  reportTimestamp,
  writeJsonFile,
} from "./lib/report_io.mjs";

export async function fetchTwseSnapshot({ ticker = "2330", date } = {}) {
  if (!date) throw new Error("--date is required for TWSE STOCK_DAY");

  const stockDayPayload = await fetchTwseStockDay(ticker, date);
  const stockDayRows = normalizeTwseStockDayPayload(stockDayPayload);
  const bwibbuPayload = await fetchTwseBwibbu();
  const bwibbuRows = normalizeBwibbuPayload(bwibbuPayload);

  return {
    generated_at: new Date().toISOString(),
    source: "twse",
    ticker,
    date,
    stock_day: {
      raw: stockDayPayload,
      normalized: stockDayRows,
      matched: stockDayRows.find((row) => row.date === date) ?? null,
    },
    bwibbu: {
      row_count: bwibbuRows.length,
      matched: bwibbuRows.find((row) => row.code === ticker) ?? null,
    },
  };
}

async function main() {
  const args = parseArgs();
  const ticker = args.ticker || "2330";
  const date = args.date;
  const outputPath =
    args.out || defaultReportPath(`twse-${ticker}-${reportTimestamp()}.json`);
  const snapshot = await fetchTwseSnapshot({ ticker, date });
  await writeJsonFile(outputPath, snapshot);
  console.log(`Wrote ${outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
