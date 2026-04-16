/** 千分位格式化 */
export function formatNumber(n, decimals = 0) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("zh-TW", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** 營收格式化（仟元 → 億元） */
export function formatRevenue(n) {
  if (n == null || isNaN(n)) return "—";
  const v = Number(n);
  if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(2) + " 億";
  if (Math.abs(v) >= 1e4) return (v / 1e4).toFixed(2) + " 萬";
  return formatNumber(v);
}

/** 百分比格式化 */
export function formatPercent(n, decimals = 2) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toFixed(decimals) + "%";
}

/** 漲跌 CSS class */
export function valClass(n) {
  if (n == null || isNaN(n) || Number(n) === 0) return "val-neutral";
  return Number(n) > 0 ? "val-up" : "val-down";
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

/** 顯示錯誤訊息 */
export function showError(el, msg = "載入失敗") {
  el.innerHTML = `<div class="section-error">${msg}</div>`;
}
