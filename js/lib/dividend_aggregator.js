/**
 * 股利資料聚合器
 *
 * Dottdot 的 md_cm_ot_dividendpolicy 是季頻（年季欄位），
 * 但報表需要年度視圖（年度現金股利 = 該年各季加總）。
 * 這個 helper 集中季→年彙總邏輯，給 dividend.js / cashflow.js /
 * financial_ratios.js / long_term_trend.js 共用。
 */

/**
 * 從年季字串（例如 "202401"）取出年度字串（"2024"）。
 * @param {string|number|undefined|null} yq
 * @returns {string|null}
 */
function yearOf(yq) {
  if (yq == null) return null;
  const s = String(yq);
  if (s.length < 4) return null;
  return s.slice(0, 4);
}

/**
 * 把季頻股利政策聚合成年度。
 *
 * 規則（只輸出可加總的量，不搬單季比率）：
 * - 以「所屬年度」為 key（從 `年季` 前 4 碼取得）
 * - `年度現金股利` = 同年度所有季別的 `現金股利合計` 加總
 * - `年度股票股利` = 同年度所有季別的 `股票股利合計` 加總
 * - `年度股利合計` = 現金 + 股票
 * - `除息日` = 同年度最後一筆非空值（僅作顯示參考）
 *
 * 不輸出殖利率、發放率：這兩個比率在原表是「單季分子 ÷ 股價或 EPS」，
 * 搬到年度列會與加總後的股利金額語意不符（例如 2330 年度股利 22 元
 * 配上當季殖利率 0.4% 會看起來像錯值）。改由 consumer 用年度數字重算：
 *   - 年度現金殖利率 = 年度現金股利 / 年末收盤價（從 dailyquotes 找該年度最後交易日）
 *   - 年度發放率     = 年度現金股利 / 年度 EPS（從 is_annual；方案 B：未結年度顯示「—」）
 *
 * @param {Array<Object>|null|undefined} quarterlyData 來自 md_cm_ot_dividendpolicy
 * @returns {Array<{
 *   年度: string,
 *   年度現金股利: number,
 *   年度股票股利: number,
 *   年度股利合計: number,
 *   除息日: string|null
 * }>} 由新到舊排序
 */
export function aggregateDividendsToAnnual(quarterlyData) {
  if (!Array.isArray(quarterlyData) || quarterlyData.length === 0) return [];

  /** @type {Map<string, { 年度: string, 年度現金股利: number, 年度股票股利: number, 年度股利合計: number, 除息日: string|null, _latestYQ: string }>} */
  const byYear = new Map();

  for (const row of quarterlyData) {
    if (!row) continue;
    const year = yearOf(row["年季"]) ?? (row["年度"] != null ? String(row["年度"]) : null);
    if (!year) continue;

    const cash = Number(row["現金股利合計"]) || 0;
    const stock = Number(row["股票股利合計"]) || 0;
    const exDate = row["除息日"] || null;
    const yq = String(row["年季"] ?? "");

    const existing = byYear.get(year);
    if (!existing) {
      byYear.set(year, {
        年度: year,
        年度現金股利: cash,
        年度股票股利: stock,
        年度股利合計: cash + stock,
        除息日: exDate,
        _latestYQ: yq,
      });
    } else {
      existing.年度現金股利 += cash;
      existing.年度股票股利 += stock;
      existing.年度股利合計 = existing.年度現金股利 + existing.年度股票股利;
      // 取同年度 最後一筆非空 除息日
      if (yq > existing._latestYQ) {
        existing._latestYQ = yq;
        if (exDate) existing.除息日 = exDate;
      } else if (!existing.除息日 && exDate) {
        existing.除息日 = exDate;
      }
    }
  }

  // 剝掉內部 _latestYQ，回傳乾淨物件
  const result = [];
  for (const v of byYear.values()) {
    const { _latestYQ, ...clean } = v;
    result.push(clean);
  }

  // 由新到舊排序
  result.sort((a, b) => b.年度.localeCompare(a.年度));
  return result;
}
