#!/usr/bin/env node
import {
  DOTTDOT_DATASETS,
  SAMPLE_TICKERS,
} from "./lib/contract.mjs";
import { parseArgs, splitList } from "./lib/cli.mjs";
import { fetchDottdotTable } from "./lib/fetchers.mjs";
import {
  defaultReportPath,
  reportTimestamp,
  writeJsonFile,
} from "./lib/report_io.mjs";

const DATASET_BY_KEY = new Map(
  DOTTDOT_DATASETS.map((dataset) => [dataset.key, dataset]),
);

export async function fetchDottdotSnapshot({
  tickers = SAMPLE_TICKERS,
  datasetKeys = DOTTDOT_DATASETS.map((dataset) => dataset.key),
  apiKey = process.env.DOTTDOT_API_KEY || "guest",
  start,
  end,
  pageSize,
} = {}) {
  const output = {
    generated_at: new Date().toISOString(),
    source: "data.dottdot.com",
    api_key_mode: apiKey === "guest" ? "guest" : "env_or_arg",
    tickers,
    datasets: {},
  };

  for (const ticker of tickers) {
    output.datasets[ticker] = {};
    for (const key of datasetKeys) {
      const dataset = DATASET_BY_KEY.get(key);
      if (!dataset) {
        output.datasets[ticker][key] = { error: `Unknown dataset key: ${key}` };
        continue;
      }

      const params = { ...dataset.defaultParams };
      if (pageSize != null) params.page_size = pageSize;
      if (start && ["quotes", "stats"].includes(key)) params.start = start;
      if (end && ["quotes", "stats"].includes(key)) params.end = end;

      try {
        const json = await fetchDottdotTable(dataset.table, {
          ticker,
          params,
          apiKey,
        });
        output.datasets[ticker][key] = {
          table: dataset.table,
          params: { ticker, ...params },
          row_count: Array.isArray(json.data) ? json.data.length : 0,
          data: json.data ?? [],
        };
      } catch (error) {
        output.datasets[ticker][key] = {
          table: dataset.table,
          params: { ticker, ...params },
          error: error.message,
        };
      }
    }
  }

  return output;
}

async function main() {
  const args = parseArgs();
  const tickers = splitList(args.tickers ?? args.ticker, SAMPLE_TICKERS);
  const datasetKeys = splitList(
    args.datasets ?? args.dataset,
    DOTTDOT_DATASETS.map((dataset) => dataset.key),
  );
  const outputPath =
    args.out ||
    defaultReportPath(`dottdot-snapshot-${reportTimestamp()}.json`);

  const snapshot = await fetchDottdotSnapshot({
    tickers,
    datasetKeys,
    apiKey: args.apiKey || process.env.DOTTDOT_API_KEY || "guest",
    start: args.start,
    end: args.end,
    pageSize: args.pageSize ? Number(args.pageSize) : undefined,
  });

  await writeJsonFile(outputPath, snapshot);
  console.log(`Wrote ${outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
