function warnInvalidNumber(formatterName, fieldName, rawValue) {
  console.warn(`[${formatterName}] malformed numeric input`, {
    field: fieldName,
    rawValue,
  });
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toFiniteNumber(rawValue, formatterName, fieldName = "value") {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    warnInvalidNumber(formatterName, fieldName, rawValue);
    return null;
  }
  return value;
}

function formatLocaleNumber(value, decimals = 0) {
  return value.toLocaleString("zh-TW", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatRevenueValue(value) {
  if (Math.abs(value) >= 1e8) return `${formatLocaleNumber(value / 1e8, 2)} 億`;
  if (Math.abs(value) >= 1e4) return `${formatLocaleNumber(value / 1e4, 2)} 萬`;
  return formatLocaleNumber(value);
}

/** 千分位格式化 */
export function formatNumber(n, decimals = 0, fieldName = "value") {
  const value = toFiniteNumber(n, "formatNumber", fieldName);
  if (value == null) return "—";
  return formatLocaleNumber(value, decimals);
}

/** 營收格式化（元 → 億元 / 萬元） */
export function formatRevenue(n, fieldName = "value") {
  const value = toFiniteNumber(n, "formatRevenue", fieldName);
  if (value == null) return "—";
  return formatRevenueValue(value);
}

/** 仟元 → 億元 */
export function valueFromThousandToYi(n, fieldName = "value") {
  const value = toFiniteNumber(n, "valueFromThousandToYi", fieldName);
  if (value == null) return null;
  return value / 1e5;
}

/** 營收格式化（仟元 → 億元 / 萬元） */
export function formatRevenueFromThousand(n, fieldName = "value") {
  const value = toFiniteNumber(n, "formatRevenueFromThousand", fieldName);
  if (value == null) return "—";
  return formatRevenueValue(value * 1000);
}

/** 百分比格式化 */
export function formatPercent(n, decimals = 2, fieldName = "value") {
  const value = toFiniteNumber(n, "formatPercent", fieldName);
  if (value == null) return "—";
  return value.toFixed(decimals) + "%";
}

/** 漲跌 CSS class */
export function valClassChange(n) {
  if (n == null || isNaN(n) || Number(n) === 0) return "val-neutral";
  return Number(n) > 0 ? "val-up" : "val-down";
}

/** 水位/等級型指標保持中性呈現，避免誤導成漲跌語意 */
export function valClassLevel() {
  return "val-neutral";
}

/** 向後相容：舊呼叫點預設仍走漲跌語意 */
export function valClass(n) {
  return valClassChange(n);
}

/** 漲跌符號 */
export function signStr(n) {
  if (n == null || isNaN(n)) return "";
  return Number(n) > 0 ? "+" : "";
}

/** 日期字串取月日 MM/DD */
export function shortDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  return `${parts[1]}/${parts[2]}`;
}

/** 計算比率 (a/b * 100) */
export function calcRate(a, b) {
  if (!b || Number(b) === 0) return null;
  return (Number(a) / Number(b)) * 100;
}

/**
 * 安全除法：分母為 0 或任一方不是有限數時回傳 null。
 * @param {number} a
 * @param {number} b
 * @returns {number|null}
 */
export function safeDiv(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb) || nb === 0) return null;
  return na / nb;
}

/**
 * 複合年增率 CAGR = (end/start)^(1/years) − 1
 * 任一參數非有效或 start <= 0 時回傳 null。
 * @param {number} end
 * @param {number} start
 * @param {number} years
 * @returns {number|null}
 */
export function cagr(end, start, years) {
  const e = Number(end);
  const s = Number(start);
  const y = Number(years);
  if (!Number.isFinite(e) || !Number.isFinite(s) || !Number.isFinite(y))
    return null;
  if (s <= 0 || y <= 0) return null;
  return Math.pow(e / s, 1 / y) - 1;
}

/**
 * 集中管理 Dottdot 欄位名稱常數，避免 Unicode（特別是 en dash U+2013）與錯字。
 * 所有 JS key 讀取請用 FIELD.* 而非字面字串。
 */
export const FIELD = Object.freeze({
  // md_cm_fi_is_*
  NI_PARENT: "母公司業主–稅後純益", // en dash U+2013
  REVENUE: "營業收入淨額",
  OP_PROFIT: "營業利益",
  INTEREST_EXPENSE: "利息費用",
  PRETAX: "稅前純益",
  AFTERTAX: "稅後純益",
  EPS: "每股稅後盈餘",
  EPS_RAW: "原始每股稅後盈餘",
  // md_cm_fi_bs_*
  EQUITY_PARENT: "母公司業主權益",
  EQUITY_TOTAL: "權益總計",
  ASSET_TOTAL: "資產總計",
  LIAB_TOTAL: "負債總計",
  CURRENT_ASSET: "流動資產",
  CURRENT_LIAB: "流動負債",
  INVENTORY: "存貨",
  // md_cm_fi_cf_*
  OCF: "營業活動現金流量",
  ICF: "投資活動現金流量",
  FCF_FIN: "融資活動現金流量",
  FCF: "自由現金流量",
});

/** 清空容器內容 */
export function clearSection(el) {
  el.innerHTML = "";
}

export function sortDescByKey(rows, key) {
  return [...(rows ?? [])].sort((left, right) =>
    String(right?.[key] ?? "").localeCompare(String(left?.[key] ?? "")),
  );
}

export function sortAscByKey(rows, key) {
  return [...(rows ?? [])].sort((left, right) =>
    String(left?.[key] ?? "").localeCompare(String(right?.[key] ?? "")),
  );
}

export function sortDescByNumericKey(rows, key) {
  return [...(rows ?? [])].sort(
    (left, right) => Number(right?.[key] ?? Number.NEGATIVE_INFINITY) -
      Number(left?.[key] ?? Number.NEGATIVE_INFINITY),
  );
}

export function latestRowByKey(rows, key) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.reduce((latest, current) => {
    if (!latest?.[key]) return current;
    if (!current?.[key]) return latest;
    return String(current[key]).localeCompare(String(latest[key])) > 0
      ? current
      : latest;
  }, null);
}

export function buildLoadingMarkup(label = "資料", options = {}) {
  const containerClass = ["section-loading", options.containerClass]
    .filter(Boolean)
    .join(" ");
  const contentHtml =
    options.contentHtml ??
    `<div class="${["skeleton", options.skeletonClass].filter(Boolean).join(" ")}"></div>`;

  return `
    <div class="${containerClass}" role="status" aria-live="polite">
      <span class="sr-only">${escapeHtml(label)}載入中</span>
      ${contentHtml}
    </div>
  `;
}

/** 顯示不適用/無資料訊息 */
export function showNotApplicable(el, msg = "此資料暫不適用") {
  el.innerHTML = `<div class="section-empty" role="status" aria-live="polite">${escapeHtml(msg)}</div>`;
}

export function resolveRetryTicker(retryTicker, fallbackTicker = "") {
  return String(retryTicker ?? fallbackTicker ?? "").trim();
}

/** 顯示錯誤訊息 */
export function showError(el, msg = "載入失敗", options = {}) {
  const retryButtonAttributes = [
    `data-retry-section="${escapeHtml(options.retrySection)}"`,
  ];
  if (options.retryTicker) {
    retryButtonAttributes.push(
      `data-retry-ticker="${escapeHtml(options.retryTicker)}"`,
    );
  }
  const retryButton = options.retrySection
    ? `<button type="button" ${retryButtonAttributes.join(" ")}>${escapeHtml(options.retryLabel || "重試此區塊")}</button>`
    : "";
  el.innerHTML = `<div class="section-error" role="alert">${escapeHtml(msg)}${retryButton}</div>`;
}
