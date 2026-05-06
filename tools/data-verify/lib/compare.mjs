import { MISMATCH_CLASSIFICATIONS } from "./contract.mjs";

export function toNumber(value) {
  if (value == null || value === "" || value === "--" || value === "—") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const normalized = String(value)
    .trim()
    .replace(/,/g, "")
    .replace(/%$/g, "")
    .replace(/^X$/i, "");
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

export function lotsToShares(value) {
  const numeric = toNumber(value);
  return numeric == null ? null : numeric * 1000;
}

export function compareNumeric({
  id,
  label = id,
  dottdotValue,
  officialValue,
  transformDottdot = (value) => toNumber(value),
  transformOfficial = (value) => toNumber(value),
  tolerance = 0,
  meta = {},
}) {
  const dottdotComparable = transformDottdot(dottdotValue);
  const officialComparable = transformOfficial(officialValue);
  const canCompare =
    Number.isFinite(dottdotComparable) && Number.isFinite(officialComparable);

  if (!canCompare) {
    return {
      id,
      label,
      status: "missing",
      dottdotValue,
      officialValue,
      dottdotComparable,
      officialComparable,
      diff: null,
      absDiff: null,
      tolerance,
      meta,
    };
  }

  const diff = dottdotComparable - officialComparable;
  const absDiff = Math.abs(diff);
  return {
    id,
    label,
    status: absDiff <= tolerance ? "pass" : "fail",
    dottdotValue,
    officialValue,
    dottdotComparable,
    officialComparable,
    diff,
    absDiff,
    tolerance,
    meta,
  };
}

export function classifyMismatch(result, classification, reason = "") {
  if (!MISMATCH_CLASSIFICATIONS.includes(classification)) {
    throw new Error(`Unknown mismatch classification: ${classification}`);
  }
  return {
    ...result,
    classification,
    reason,
  };
}

export function formatCsvValue(value) {
  if (value == null) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function rowsToCsv(rows, columns) {
  return [
    columns.map((column) => formatCsvValue(column)).join(","),
    ...rows.map((row) =>
      columns.map((column) => formatCsvValue(row[column])).join(","),
    ),
  ].join("\n");
}
