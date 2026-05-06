import { toNumber } from "./compare.mjs";

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function sortAscByField(rows, field) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) =>
    String(left?.[field] ?? "").localeCompare(String(right?.[field] ?? "")),
  );
}

function sortDescByField(rows, field) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) =>
    String(right?.[field] ?? "").localeCompare(String(left?.[field] ?? "")),
  );
}

function sumWindow(rows, endIndex, windowSize, field) {
  const startIndex = endIndex - windowSize + 1;
  if (startIndex < 0) return null;
  let sum = 0;
  for (let index = startIndex; index <= endIndex; index += 1) {
    const value = toNumber(rows[index]?.[field]);
    if (value == null) return null;
    sum += value;
  }
  return sum;
}

export function computeRollingRevenueYoy(
  rows,
  targetMonth,
  windowSize,
  field = "單月合併營收",
) {
  const rowsAsc = sortAscByField(rows, "年月");
  const monthIndex = rowsAsc.findIndex(
    (row) => String(row?.["年月"] ?? "") === String(targetMonth),
  );
  if (monthIndex < 0) return null;
  const current = sumWindow(rowsAsc, monthIndex, windowSize, field);
  const previous = sumWindow(rowsAsc, monthIndex - 12, windowSize, field);
  return pctChange(current, previous);
}

export function computeEpsTtmYoy(rows, field = "每股稅後盈餘") {
  const rowsDesc = sortDescByField(rows, "年季");
  if (rowsDesc.length < 8) return null;
  const latest = rowsDesc.slice(0, 4).reduce((sum, row) => {
    const value = toNumber(row?.[field]);
    return value == null ? NaN : sum + value;
  }, 0);
  const previous = rowsDesc.slice(4, 8).reduce((sum, row) => {
    const value = toNumber(row?.[field]);
    return value == null ? NaN : sum + value;
  }, 0);
  return pctChange(latest, previous);
}

export function computeShareholderMidTier({ above400, below100 }) {
  const top = toNumber(above400);
  const bottom = toNumber(below100);
  if (top == null || bottom == null) return null;
  return Number(Math.max(0, 100 - top - bottom).toFixed(10));
}
