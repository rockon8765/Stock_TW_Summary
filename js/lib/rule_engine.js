/**
 * Frontend live alerts engine.
 *
 * 這組規則只服務網頁上的「即時規則警示（Live API）」區塊，
 * 直接從 Dottdot API 已 fetch 的資料計算，不承諾與 ScoreCard export
 * 或 Python pipeline 的 snapshot 完全一致。
 */
import { sortAscByKey, sortDescByKey } from "../utils.js";

const PERIOD_COUNT = 6;
const EMPTY_LABEL = "—";

function naCell(label = EMPTY_LABEL, reason = "資料不足") {
  return { label, triggered: null, detail: reason };
}

function emptyPeriods() {
  return Array.from({ length: PERIOD_COUNT }, () => naCell());
}

function formatYM(yyyymm) {
  const text = String(yyyymm ?? "");
  if (text.length < 6) return EMPTY_LABEL;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}`;
}

function parseYQ(yyyyq) {
  const text = String(yyyyq ?? "");
  if (text.length < 6) return null;
  const year = Number(text.slice(0, 4));
  const quarter = Number(text.slice(4, 6));
  if (!Number.isInteger(year) || !Number.isInteger(quarter)) return null;
  if (quarter < 1 || quarter > 4) return null;
  return { year, quarter };
}

function formatYQ(yyyyq) {
  const parsed = parseYQ(yyyyq);
  return parsed ? `${parsed.year}Q${parsed.quarter}` : EMPTY_LABEL;
}

function computeYoy(cur, prev) {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0)
    return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function formatPct(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : "N/A";
}

function formatValue(value, decimals = 2) {
  return Number.isFinite(value) ? value.toFixed(decimals) : "N/A";
}

function padOldestFirst(cells) {
  const out = cells.slice(-PERIOD_COUNT);
  while (out.length < PERIOD_COUNT) out.unshift(naCell());
  return out;
}

function monthEndRows(quotes, dateKey = "日期") {
  if (!Array.isArray(quotes) || quotes.length === 0) return [];
  const byMonth = new Map();
  for (const row of sortAscByKey(quotes, dateKey)) {
    const date = String(row?.[dateKey] ?? "");
    if (!date) continue;
    byMonth.set(date.slice(0, 7), row);
  }
  return [...byMonth.entries()].map(([label, row]) => ({ label, row }));
}

function lastRowOnOrBefore(rows, dateKey, cutoff) {
  let latest = null;
  for (const row of sortAscByKey(rows, dateKey)) {
    const date = String(row?.[dateKey] ?? "");
    if (!date || date > cutoff) continue;
    latest = row;
  }
  return latest;
}

/**
 * S10：累積營收連續三個月YOY衰退10%
 * 資料：monthsales 的 `累計合併營收成長` 欄位（百分比）
 */
function checkS10(monthsales) {
  const sorted = sortDescByKey(monthsales, "年月");
  const periods = emptyPeriods();

  for (let i = 0; i < PERIOD_COUNT; i++) {
    const anchor = sorted[i];
    const label = anchor ? formatYM(anchor["年月"]) : EMPTY_LABEL;
    const rows = sorted.slice(i, i + 3);
    if (!anchor || rows.length < 3) {
      periods[PERIOD_COUNT - 1 - i] = naCell(label);
      continue;
    }

    const values = rows.map((row) => Number(row?.["累計合併營收成長"]));
    if (values.some((value) => !Number.isFinite(value))) {
      periods[PERIOD_COUNT - 1 - i] = naCell(label, "累計營收年增率資料不足");
      continue;
    }

    periods[PERIOD_COUNT - 1 - i] = {
      label,
      triggered: values.every((value) => value < -10),
      detail: values.map(formatPct).join(", "),
    };
  }

  return periods;
}

function checkQuarterlyYOYDeclineSeries(incomeQ, field, thresholdPct) {
  const sorted = sortDescByKey(incomeQ, "年季");
  const periods = emptyPeriods();

  for (let i = 0; i < PERIOD_COUNT; i++) {
    const anchor = sorted[i];
    const label = anchor ? formatYQ(anchor["年季"]) : EMPTY_LABEL;
    const current = Number(sorted[i]?.[field]);
    const currentYearAgo = Number(sorted[i + 4]?.[field]);
    const previous = Number(sorted[i + 1]?.[field]);
    const previousYearAgo = Number(sorted[i + 5]?.[field]);
    const currentYoy = computeYoy(current, currentYearAgo);
    const previousYoy = computeYoy(previous, previousYearAgo);

    if (!anchor || currentYoy == null || previousYoy == null) {
      periods[PERIOD_COUNT - 1 - i] = naCell(
        label,
        `${field} YOY lookback 不足`,
      );
      continue;
    }

    periods[PERIOD_COUNT - 1 - i] = {
      label,
      triggered: currentYoy < thresholdPct && previousYoy < thresholdPct,
      detail: `當季 ${formatPct(currentYoy)}, 前季 ${formatPct(previousYoy)}`,
    };
  }

  return periods;
}

/**
 * S11：連續兩季單季稅後淨利YOY衰退5%
 */
function checkS11(incomeQ) {
  return checkQuarterlyYOYDeclineSeries(incomeQ, "稅後純益", -5);
}

/**
 * S12：連續兩季單季營業利益YOY衰退5%
 */
function checkS12(incomeQ) {
  return checkQuarterlyYOYDeclineSeries(incomeQ, "營業利益", -5);
}

function sumYtdByQuarter(rows, year, quarter, field) {
  let sum = 0;
  for (let q = 1; q <= quarter; q++) {
    const row = rows.find((candidate) => {
      const parsed = parseYQ(candidate?.["年季"]);
      return parsed?.year === year && parsed.quarter === q;
    });
    const value = Number(row?.[field]);
    if (!row || !Number.isFinite(value)) return null;
    sum += value;
  }
  return sum;
}

/**
 * S13：今年以來稅後獲利衰退YOY達10%
 */
function checkS13(incomeQ) {
  const sorted = sortDescByKey(incomeQ, "年季");
  const periods = emptyPeriods();

  for (let i = 0; i < PERIOD_COUNT; i++) {
    const anchor = sorted[i];
    const parsed = parseYQ(anchor?.["年季"]);
    const label = anchor ? formatYQ(anchor["年季"]) : EMPTY_LABEL;
    if (!anchor || !parsed) {
      periods[PERIOD_COUNT - 1 - i] = naCell(label);
      continue;
    }

    const currentYtd = sumYtdByQuarter(
      sorted,
      parsed.year,
      parsed.quarter,
      "稅後純益",
    );
    const previousYtd = sumYtdByQuarter(
      sorted,
      parsed.year - 1,
      parsed.quarter,
      "稅後純益",
    );
    const yoy = computeYoy(currentYtd, previousYtd);

    if (yoy == null) {
      periods[PERIOD_COUNT - 1 - i] = naCell(
        label,
        "YTD 稅後純益 lookback 不足",
      );
      continue;
    }

    periods[PERIOD_COUNT - 1 - i] = {
      label,
      triggered: yoy < -10,
      detail: `YTD ${formatPct(yoy)}`,
    };
  }

  return periods;
}

/**
 * S17：PB百分位大於80%
 */
function checkS17(quotes) {
  const sortedAsc = sortAscByKey(quotes, "日期");
  const cells = monthEndRows(sortedAsc)
    .slice(-PERIOD_COUNT)
    .map(({ label, row }) => {
      const cutoff = String(row?.["日期"] ?? "");
      const prefix = `cutoff ${cutoff};`;
      const window = sortedAsc.filter((candidate) => {
        const date = String(candidate?.["日期"] ?? "");
        return date && date <= cutoff;
      });
      const pbValues = window
        .map((candidate) => Number(candidate?.["股價淨值比"]))
        .filter((value) => Number.isFinite(value) && value > 0);
      const pb = Number(row?.["股價淨值比"]);

      if (pbValues.length < 250)
        return naCell(label, `${prefix} 歷史 PB 樣本不足`);
      if (!Number.isFinite(pb) || pb <= 0)
        return naCell(label, `${prefix} PB 資料不足`);

      const sortedPb = [...pbValues].sort((left, right) => left - right);
      const rank = sortedPb.filter((value) => value <= pb).length;
      const percentile = rank / sortedPb.length;
      return {
        label,
        triggered: percentile > 0.8,
        detail: `${prefix} PB ${formatValue(pb)}, 百分位 ${formatPct(percentile * 100)}`,
      };
    });

  return padOldestFirst(cells);
}

/**
 * S20：單月營收年增率連兩月衰退
 */
function checkS20(monthsales) {
  const sorted = sortDescByKey(monthsales, "年月");
  const periods = emptyPeriods();

  for (let i = 0; i < PERIOD_COUNT; i++) {
    const anchor = sorted[i];
    const label = anchor ? formatYM(anchor["年月"]) : EMPTY_LABEL;
    const rows = sorted.slice(i, i + 2);
    if (!anchor || rows.length < 2) {
      periods[PERIOD_COUNT - 1 - i] = naCell(label);
      continue;
    }

    const values = rows.map((row) => Number(row?.["單月合併營收年成長"]));
    if (values.some((value) => !Number.isFinite(value))) {
      periods[PERIOD_COUNT - 1 - i] = naCell(label, "單月營收年增率資料不足");
      continue;
    }

    periods[PERIOD_COUNT - 1 - i] = {
      label,
      triggered: values.every((value) => value < 0),
      detail: values.map(formatPct).join(", "),
    };
  }

  return periods;
}

/**
 * S22：股票跌破年線且比大盤弱10%
 */
function checkS22(quotes, stats) {
  const sortedAsc = sortAscByKey(quotes, "日期");
  const sortedStats = sortAscByKey(stats, "日期");
  const cells = monthEndRows(sortedAsc)
    .slice(-PERIOD_COUNT)
    .map(({ label, row }) => {
      const cutoff = String(row?.["日期"] ?? "");
      const prefix = `cutoff ${cutoff};`;
      const quoteWindow = sortedAsc.filter((candidate) => {
        const date = String(candidate?.["日期"] ?? "");
        return date && date <= cutoff;
      });
      const closeRows = quoteWindow.filter((candidate) =>
        Number.isFinite(Number(candidate?.["收盤價"])),
      );
      const latestClose = Number(row?.["收盤價"]);
      if (closeRows.length < 250)
        return naCell(label, `${prefix} 250 日收盤價樣本不足`);
      if (!Number.isFinite(latestClose))
        return naCell(label, `${prefix} 收盤價資料不足`);

      const recent250 = closeRows
        .slice(-250)
        .map((candidate) => Number(candidate["收盤價"]));
      const ma250 = recent250.reduce((sum, value) => sum + value, 0) / 250;
      const stat = lastRowOnOrBefore(sortedStats, "日期", cutoff);
      const alpha = Number(stat?.["Alpha250D"]);
      if (!stat || !Number.isFinite(alpha))
        return naCell(label, `${prefix} Alpha250D 資料不足`);

      return {
        label,
        triggered: latestClose < ma250 && alpha < -0.1,
        detail:
          `${prefix} close ${formatValue(latestClose)}, ` +
          `MA250 ${formatValue(ma250)}, Alpha250D ${formatValue(alpha, 4)}`,
      };
    });

  return padOldestFirst(cells);
}

/**
 * 主入口：計算 7 條 sell rules 的近 6 期觸發狀態。
 *
 * @param {Object} params
 * @param {Array<Object>|null} params.monthsales md_cm_fi_monthsales（12 月）
 * @param {Array<Object>|null} params.incomeQ     md_cm_fi_is_quarterly（14Q）
 * @param {Array<Object>|null} params.quotes      md_cm_ta_dailyquotes（5Y 日頻）
 * @param {Array<Object>|null} params.stats       md_cm_ta_dailystatistics（5Y 日頻）
 * @returns {{ rules: Array<{code: string, name: string, frequency: string, detail: string, periods: Array<{label: string, triggered: boolean|null, detail: string}>, latest: object, triggered: boolean}>, alertCount: number, latestAlertCount: number, latestAvailableCount: number, latestNaCount: number }}
 */
export function computeRuleAlerts({ monthsales, incomeQ, quotes, stats } = {}) {
  const rules = [
    {
      code: "S10",
      name: "累積營收連續三個月YOY衰退10%",
      frequency: "monthly",
      detail: "",
      periods: checkS10(monthsales),
    },
    {
      code: "S11",
      name: "連續兩季單季稅後淨利YOY衰退5%",
      frequency: "quarterly",
      detail: "",
      periods: checkS11(incomeQ),
    },
    {
      code: "S12",
      name: "連續兩季單季營業利益YOY衰退5%",
      frequency: "quarterly",
      detail: "",
      periods: checkS12(incomeQ),
    },
    {
      code: "S13",
      name: "今年以來稅後獲利衰退YOY達10%",
      frequency: "quarterly",
      detail: "",
      periods: checkS13(incomeQ),
    },
    {
      code: "S20",
      name: "單月營收年增率連兩月衰退",
      frequency: "monthly",
      detail:
        "Live API 直接檢查最近 2 個月的單月營收年增率，不是 ScoreCard 的季資料規則。",
      periods: checkS20(monthsales),
    },
    {
      code: "S22",
      name: "跌破年線且 Alpha250D < -10%（即時近似）",
      frequency: "monthEndDaily",
      detail:
        "Live API 以 Alpha250D 近似 ScoreCard 的「與大盤比年報酬率」訊號，前端與快照可能不同步。",
      periods: checkS22(quotes, stats),
    },
    {
      code: "S17",
      name: "PB百分位大於80%",
      frequency: "monthEndDaily",
      detail: "",
      periods: checkS17(quotes),
    },
  ].map((rule) => {
    const periods = padOldestFirst(rule.periods ?? []);
    const latest = periods[PERIOD_COUNT - 1] ?? null;
    return {
      ...rule,
      periods,
      latest,
      triggered: latest?.triggered === true,
    };
  });

  const latestAlertCount = rules.filter((rule) => rule.triggered).length;
  const latestAvailableCount = rules.filter(
    (rule) => rule.latest != null && rule.latest.triggered !== null,
  ).length;
  const latestNaCount = rules.length - latestAvailableCount;

  return {
    rules,
    alertCount: latestAlertCount,
    latestAlertCount,
    latestAvailableCount,
    latestNaCount,
  };
}

export function computeBuyScore(latestAvailableCount, latestAlertCount) {
  const available = Math.max(
    0,
    Math.min(
      7,
      Number.isFinite(Number(latestAvailableCount))
        ? Number(latestAvailableCount)
        : 0,
    ),
  );
  const triggered = Math.max(
    0,
    Math.min(
      available,
      Number.isFinite(Number(latestAlertCount)) ? Number(latestAlertCount) : 0,
    ),
  );
  const na = Math.max(0, 7 - available);
  const score =
    available === 0 ? null : ((available - triggered) * 10) / available;

  return {
    score,
    displayText: score == null ? "資料不足" : score.toFixed(1),
    available,
    triggered,
    na,
  };
}

function endOfMonthDate(label) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(label ?? ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`;
}

function monthLabelFromPeriod(period) {
  const label = String(period?.label ?? "");
  return /^\d{4}-\d{2}$/.test(label) ? label : null;
}

function explicitCutoffFromDetail(period) {
  const detail = String(period?.detail ?? "");
  const cutoff = /cutoff (\d{4}-\d{2}-\d{2})/.exec(detail);
  return cutoff ? cutoff[1] : null;
}

function anchorPeriodForIndex(rules, index) {
  const monthly = rules
    .map((rule) => rule.periods?.[index])
    .find((period) => monthLabelFromPeriod(period));
  return monthly ?? rules[0]?.periods?.[index] ?? null;
}

function dateForPeriodIndex(rules, index, label) {
  // 優先使用任一 rule 在該 index 的 detail 中明示的 cutoff（通常來自 monthEndDaily 規則，
  // 例如 S22 的 detail 含 "cutoff 2026-02-28; close 100"）。所有 rule 都沒寫 cutoff 時，
  // 才用 label 推算的當月最後一天作為 fallback。
  for (const rule of rules) {
    const cutoff = explicitCutoffFromDetail(rule?.periods?.[index]);
    if (cutoff) return cutoff;
  }
  return endOfMonthDate(label) ?? label;
}

export function computePeriodScores(ruleResult) {
  const rules = Array.isArray(ruleResult?.rules) ? ruleResult.rules : [];
  if (rules.length === 0) return [];

  return Array.from({ length: PERIOD_COUNT }, (_, index) => {
    const anchor = anchorPeriodForIndex(rules, index);
    const label =
      monthLabelFromPeriod(anchor) ?? String(anchor?.label ?? `P${index + 1}`);
    const date = dateForPeriodIndex(rules, index, label);
    const cells = rules
      .map((rule) => rule.periods?.[index])
      .filter(
        (period) =>
          period?.triggered !== null && period?.triggered !== undefined,
      );
    const triggered = cells.filter(
      (period) => period.triggered === true,
    ).length;
    const score = computeBuyScore(cells.length, triggered);

    return {
      date,
      label,
      score: score.score,
      available: score.available,
      triggered: score.triggered,
      na: Math.max(0, rules.length - score.available),
    };
  });
}
