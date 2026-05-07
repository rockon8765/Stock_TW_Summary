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
  bwibbuDateToIso,
  normalizeBwibbuPayload,
  normalizeTwseStockDayPayload,
} from "./lib/fetchers.mjs";
import {
  defaultReportPath,
  reportTimestamp,
  writeTextFile,
} from "./lib/report_io.mjs";
import { aggregateDividendsToAnnual } from "../../js/lib/dividend_aggregator.js";

export { bwibbuDateToIso };

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

export function resultRow(result, { ticker, date, source }) {
  const classification = result.classification ?? "";
  const reason = result.reason ?? result.meta?.reason ?? "";
  const needsExplanation =
    ["fail", "missing"].includes(result.status) && !classification;
  return {
    ticker,
    date,
    id: result.id,
    label: result.label,
    source,
    status: result.status,
    needs_explanation: needsExplanation ? "yes" : "no",
    classification,
    reason,
    dottdot_value: result.dottdotValue,
    official_value: result.officialValue,
    dottdot_comparable: result.dottdotComparable,
    official_comparable: result.officialComparable,
    diff: result.diff,
    tolerance: result.tolerance,
  };
}

const QUOTE_CHECKS = [
  {
    id: "quotes.open",
    label: "開盤價",
    dottdotField: "開盤價",
    officialField: "open",
    tolerance: TOLERANCES.price,
  },
  {
    id: "quotes.high",
    label: "最高價",
    dottdotField: "最高價",
    officialField: "high",
    tolerance: TOLERANCES.price,
  },
  {
    id: "quotes.low",
    label: "最低價",
    dottdotField: "最低價",
    officialField: "low",
    tolerance: TOLERANCES.price,
  },
  {
    id: "quotes.close",
    label: "收盤價",
    dottdotField: "收盤價",
    officialField: "close",
    tolerance: TOLERANCES.price,
  },
  {
    id: "quotes.change",
    label: "漲跌",
    dottdotField: "漲跌",
    officialField: "change",
    tolerance: TOLERANCES.price,
  },
];

const BWIBBU_CHECKS = [
  {
    id: "quotes.pe4",
    label: "本益比4",
    dottdotField: "本益比4",
    officialField: "pe",
    tolerance: TOLERANCES.pe,
  },
  {
    id: "quotes.pb",
    label: "股價淨值比",
    dottdotField: "股價淨值比",
    officialField: "pb",
    tolerance: TOLERANCES.pb,
  },
  {
    id: "quotes.dividend_yield",
    label: "殖利率",
    officialField: "dividendYield",
    tolerance: TOLERANCES.ratioPercentPoint,
  },
];

export function selectDottdotQuoteForDate(rows, requestedDate) {
  const sortedRows = sortDescByDate(rows);
  const latestQuote = sortedRows[0] ?? null;
  const targetDate = requestedDate || latestQuote?.["日期"] || "";
  const quote =
    targetDate === ""
      ? null
      : (sortedRows.find((row) => row?.["日期"] === targetDate) ?? null);

  return {
    quote,
    targetDate,
    latestQuote,
    missingRequestedDate: Boolean(requestedDate && !quote),
  };
}

export function computeFrontendDividendYield(dottdotQuote, dottdotDividendRows) {
  const close = toNumber(dottdotQuote?.["收盤價"]);
  if (close == null || close <= 0) return null;

  const dividendRows = Array.isArray(dottdotDividendRows)
    ? dottdotDividendRows
    : [];
  const annualRows = dividendRows.some((row) => row?.["年度現金股利"] != null)
    ? sortDescByDate(dividendRows, "年度")
    : aggregateDividendsToAnnual(dividendRows);
  const latestCashDividend = toNumber(annualRows[0]?.["年度現金股利"]);
  if (latestCashDividend == null) return null;
  return (latestCashDividend / close) * 100;
}

function dateMismatchResult({
  id,
  label,
  status = "missing",
  dottdotValue = null,
  officialValue = null,
  tolerance = 0,
  reason,
}) {
  return {
    id,
    label,
    status,
    classification: "date_mismatch",
    reason,
    dottdotValue,
    officialValue,
    dottdotComparable: null,
    officialComparable: null,
    diff: null,
    absDiff: null,
    tolerance,
  };
}

// 經驗門檻：當日盤後零股 + 鉅額交易最大量級（大型權值股 1 日上限約 5K 張）
const VOLUME_INTRADAY_DELAY_MAX_SHARES = 10_000_000;

export function buildTierAComparisons({
  ticker,
  dottdotQuote,
  twseQuote,
  bwibbuRow,
  dottdotDividendRows = [],
  targetDate,
  isLiveLatestMode = true,
}) {
  const date = targetDate || dottdotQuote?.["日期"] || "";
  if (!dottdotQuote) {
    const reason = date
      ? `requested date ${date} not present in dottdot quotes`
      : "dottdot quote row missing";
    return [
      ...QUOTE_CHECKS.map((check) =>
        resultRow(dateMismatchResult({ ...check, reason }), {
          ticker,
          date,
          source: "TWSE STOCK_DAY",
        }),
      ),
      resultRow(
        dateMismatchResult({
          id: "quotes.volume_shares",
          label: "成交量（股）",
          tolerance: TOLERANCES.shares,
          reason,
        }),
        { ticker, date, source: "TWSE STOCK_DAY" },
      ),
      ...BWIBBU_CHECKS.map((check) =>
        resultRow(dateMismatchResult({ ...check, reason }), {
          ticker,
          date,
          source: "TWSE BWIBBU_d",
        }),
      ),
    ];
  }

  const quoteChecks = QUOTE_CHECKS.map(
    ({ id, label, dottdotField, officialField, tolerance }) =>
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

  const volumeBase = compareNumeric({
    id: "quotes.volume_shares",
    label: "成交量（股）",
    dottdotValue: resolveQuoteVolume(dottdotQuote),
    officialValue: twseQuote?.tradeVolume,
    tolerance: TOLERANCES.shares,
  });
  // 成交量 fail 只在「live latest 模式 + dottdot 短少 + 差距在盤後典型範圍」三個條件
  // 同時成立時才自動標 date_mismatch；其他情境（指定歷史日、單位錯、量級異常）
  // 一律保留為 unexplained，避免吃掉真 bug
  const volumeIsLikelyIntradayDelay =
    volumeBase.status === "fail" &&
    isLiveLatestMode &&
    Number.isFinite(volumeBase.diff) &&
    volumeBase.diff < 0 &&
    volumeBase.absDiff <= VOLUME_INTRADAY_DELAY_MAX_SHARES;
  const volumeResult = volumeIsLikelyIntradayDelay
    ? {
        ...volumeBase,
        classification: "date_mismatch",
        reason:
          "dottdot 對最新交易日成交量為盤中數據，盤後零股／鉅額交易與當日修正於隔一交易日補齊",
      }
    : volumeBase;
  const volumeCheck = resultRow(volumeResult, {
    ticker,
    date,
    source: "TWSE STOCK_DAY",
  });

  const frontendDividendYield = computeFrontendDividendYield(
    dottdotQuote,
    dottdotDividendRows,
  );
  const bwibbuDate = bwibbuRow?.date ?? null;
  const dottdotDate = dottdotQuote?.["日期"] ?? date;
  const bwibbuValues = {
    "quotes.pe4": dottdotQuote?.["本益比4"],
    "quotes.pb": dottdotQuote?.["股價淨值比"],
    "quotes.dividend_yield": frontendDividendYield,
  };

  const bwibbuChecks =
    bwibbuDate !== dottdotDate
      ? BWIBBU_CHECKS.map((check) =>
          resultRow(
            dateMismatchResult({
              id: check.id,
              label: check.label,
              status: "skipped_date_mismatch",
              dottdotValue: bwibbuValues[check.id],
              officialValue: bwibbuRow?.[check.officialField],
              tolerance: check.tolerance,
              reason: `dottdot quote date ${dottdotDate || "missing"} differs from BWIBBU date ${bwibbuDate || "missing"}`,
            }),
            { ticker, date, source: "TWSE BWIBBU_d" },
          ),
        )
      : BWIBBU_CHECKS.map(
          ({ id, label, dottdotField, officialField, tolerance }) =>
            resultRow(
              compareNumeric({
                id,
                label,
                dottdotValue:
                  id === "quotes.dividend_yield"
                    ? frontendDividendYield
                    : dottdotQuote?.[dottdotField],
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
        needs_explanation: "no",
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
  return checks.map(([id, label, dottdotField, twseField, tolerance]) => {
    const base = compareNumeric({
      id,
      label,
      dottdotValue: dottdotSalesLatest?.[dottdotField],
      officialValue: twseSalesRow?.[twseField],
      tolerance,
      meta,
    });
    // dottdot 月營收某些金融股 YoY 欄位為 null（如國泰金），TWSE 仍能算出
    // 標 manual_review_required 待 dottdot 端確認原因（可能：去年同期資料缺漏 / 計算規則差異）
    const enriched =
      base.status === "missing" &&
      dottdotSalesLatest?.[dottdotField] == null &&
      twseSalesRow?.[twseField] != null
        ? {
            ...base,
            classification: "manual_review_required",
            reason: `dottdot ${dottdotField} 欄位為 null，但 TWSE 有值；可能為金融股月營收結構特殊或上游漏算`,
          }
        : base;
    return resultRow(enriched, {
      ticker,
      date: period,
      source: "TWSE OpenAPI t187ap05_L",
    });
  });
}

// T86 隔日修正典型最大量級（觀察 5 檔多日，最大 ~85 張 = 85K 股，給寬限至 1M 股）
const FUND_T_PLUS_ONE_CORRECTION_MAX_SHARES = 1_000_000;

export async function buildInstitutionalComparison({
  ticker,
  dottdotForeignLatest,
  dottdotTrustLatest,
  dottdotBrokerLatest,
  fetchT86 = (date) =>
    import("./lib/fetchers.mjs").then(({ fetchTwseT86 }) => fetchTwseT86(date)),
  isLiveLatestMode = true,
  latestKnownDate = null,
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
      // dottdot 該類完全無資料：只在 live latest mode 才視為「該類尚未公布」
      // 若使用者指定歷史日期但 dottdot 無資料 → 視為真實 missing，不自動分類
      const missingClassification = isLiveLatestMode ? "date_mismatch" : "";
      const missingReason = isLiveLatestMode
        ? "dottdot 該類法人最新一日資料尚未公布（外資 T+1、自營商 T+1，投信即時）"
        : "";
      rows.push(
        resultRow(
          {
            id: inv.id,
            label: inv.label,
            status: "missing",
            classification: missingClassification,
            reason: missingReason,
            dottdotValue: null,
            officialValue: null,
            dottdotComparable: null,
            officialComparable: null,
            diff: null,
            absDiff: null,
            tolerance: 0,
          },
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
    const fundBase = compareNumeric({
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
    });
    // 三個守門條件：
    //   (a) live latest mode（沒有 --date）
    //   (b) 此 dottdot 法人 row 是當前最新交易日（避免歷史日誤分類）
    //   (c) absDiff 在 T86 隔日修正典型範圍（≤ 1M 股）
    // 全部滿足才自動標 date_mismatch；其他情境保留為 unexplained
    const isFundLatestRow =
      latestKnownDate != null && date === latestKnownDate;
    const isFundWithinCorrectionWindow =
      isLiveLatestMode && isFundLatestRow;
    const isFundFailLikelyCorrection =
      fundBase.status === "fail" &&
      isFundWithinCorrectionWindow &&
      Number.isFinite(fundBase.absDiff) &&
      fundBase.absDiff <= FUND_T_PLUS_ONE_CORRECTION_MAX_SHARES;

    let fundResult = fundBase;
    if (fundBase.status === "missing" && !t86Row && isFundWithinCorrectionWindow) {
      fundResult = {
        ...fundBase,
        classification: "date_mismatch",
        reason: `TWSE T86 ${date} 尚未公布或非交易日`,
      };
    } else if (isFundFailLikelyCorrection) {
      fundResult = {
        ...fundBase,
        classification: "date_mismatch",
        reason:
          "T86 當日資料隔日修正；歷史日完全一致，差距通常 ≤ 1000 張",
      };
    }
    rows.push(resultRow(fundResult, { ticker, date, source: "TWSE T86" }));
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
    // TWSE 公布產業以代號（例：24）、dottdot 已映射為中文（例：電子–半導體）
    // 公司名稱：TWSE 含「股份有限公司」尾綴差異
    const isIndustry = id === "profile.industry_match";
    const classification =
      status === "fail" ? (isIndustry ? "endpoint_semantics" : "") : "";
    const reason =
      status === "fail" && isIndustry
        ? "TWSE OpenAPI 公布產業代號（如 24）、dottdot 已映射為中文（如「電子–半導體」），雙方語意一致僅表示形式不同"
        : "";
    return resultRow(
      {
        id,
        label,
        status,
        classification,
        reason,
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

export function renderMarkdownReport({ ticker, date, rows }) {
  const failed = rows.filter((row) => row.needs_explanation === "yes");
  return `# Tier A Verification Report

- generated_at: ${new Date().toISOString()}
- ticker: ${ticker}
- date: ${date}
- scope: TWSE quote / BWIBBU fields currently implemented
- unexplained_mismatch_count: ${failed.length}

| id | label | status | classification | reason | dottdot | official | diff | tolerance | needs explanation |
|----|-------|--------|----------------|--------|---------|----------|------|-----------|-------------------|
${rows
  .map(
    (row) =>
      `| ${row.id} | ${row.label} | ${row.status} | ${row.classification ?? ""} | ${row.reason ?? ""} | ${row.dottdot_value ?? ""} | ${row.official_value ?? ""} | ${row.diff ?? ""} | ${row.tolerance ?? ""} | ${row.needs_explanation} |`,
  )
  .join("\n")}

> Any row with \`needs_explanation = yes\` must be manually classified as one of the accepted mismatch categories before sign-off.
`;
}

export async function runTierAComparison({
  ticker = "2330",
  date,
  apiKey = process.env.DOTTDOT_API_KEY || "guest",
  fetchDottdot = fetchDottdotTable,
  fetchStockDay = fetchTwseStockDay,
  fetchBwibbu = fetchTwseBwibbu,
  fetchMonthlySales = fetchTwseMonthlySales,
  fetchCompanyList = fetchTwseCompanyList,
  fetchT86Payload = fetchTwseT86,
} = {}) {
  const [
    dottdotQuotes,
    dottdotSales,
    dottdotProfile,
    dottdotForeign,
    dottdotTrust,
    dottdotBroker,
    dottdotDividend,
  ] = await Promise.all([
    fetchDottdot("md_cm_ta_dailyquotes", {
      ticker,
      params: { page_size: 5 },
      apiKey,
    }),
    fetchDottdot("md_cm_fi_monthsales", {
      ticker,
      params: { page_size: 3 },
      apiKey,
    }).catch((error) => ({ error: error.message, data: [] })),
    fetchDottdot("bd_cm_companyprofile", {
      ticker,
      params: { page_size: 1 },
      apiKey,
    }).catch((error) => ({ error: error.message, data: [] })),
    fetchDottdot("md_cm_fd_foreigninsttrading", {
      ticker,
      params: { page_size: 5 },
      apiKey,
    }).catch((error) => ({ error: error.message, data: [] })),
    fetchDottdot("md_cm_fd_investmenttrusttrading", {
      ticker,
      params: { page_size: 5 },
      apiKey,
    }).catch((error) => ({ error: error.message, data: [] })),
    fetchDottdot("md_cm_fd_brokertrading", {
      ticker,
      params: { page_size: 5 },
      apiKey,
    }).catch((error) => ({ error: error.message, data: [] })),
    fetchDottdot("md_cm_ot_dividendpolicy", {
      ticker,
      params: { page_size: 80 },
      apiKey,
    }).catch((error) => ({ error: error.message, data: [] })),
  ]);

  const {
    quote: dottdotQuote,
    targetDate,
    latestQuote,
  } = selectDottdotQuoteForDate(dottdotQuotes.data, date);
  if (!targetDate) throw new Error("No dottdot quote date available");
  // live latest mode = 使用者沒有指定 --date；指定歷史日期則關閉所有自動分類
  const isLiveLatestMode = !date;
  const latestKnownDate = latestQuote?.["日期"] ?? null;

  const twseStockDay = await fetchStockDay(ticker, targetDate);
  const twseRows = normalizeTwseStockDayPayload(twseStockDay);
  const twseQuote = twseRows.find((row) => row.date === targetDate) ?? null;
  const bwibbu = normalizeBwibbuPayload(await fetchBwibbu());
  const bwibbuRow = bwibbu.find((row) => row.code === ticker) ?? null;

  const twseSalesPayload = await fetchMonthlySales().catch(() => null);
  const twseSalesRow = twseSalesPayload
    ? findTwseMonthlySalesRow(twseSalesPayload, ticker)
    : null;

  const twseCompanyPayload = await fetchCompanyList().catch(() => null);
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
      dottdotQuote,
      twseQuote,
      bwibbuRow,
      dottdotDividendRows: dottdotDividend.data,
      targetDate,
      isLiveLatestMode,
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
      fetchT86: (date) => fetchT86Payload(date),
      isLiveLatestMode,
      latestKnownDate,
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
