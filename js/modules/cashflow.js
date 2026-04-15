import { formatRevenue, formatNumber, FIELD, safeDiv } from "../utils.js";

/**
 * 取最近 4 季的自由現金流量加總（TTM FCF）。
 * @param {Array<Object>} cfData 已由新到舊排序的 cf_quarterly
 * @returns {number|null}
 */
function ttmFreeCashflow(cfData) {
  if (!Array.isArray(cfData) || cfData.length < 4) return null;
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const v = Number(cfData[i]?.[FIELD.FCF]);
    if (!Number.isFinite(v)) return null;
    sum += v;
  }
  return sum;
}

/**
 * 渲染 8Q 現金流摘要表 + FCF 年度股利覆蓋倍數卡片。
 *
 * @param {Array<Object>|null|undefined} cfData md_cm_fi_cf_quarterly 近 8 季
 * @param {Array<Object>} annualDiv 聚合後年度股利（由 aggregateDividendsToAnnual 產生）
 */
export function renderCashflow(cfData, annualDiv) {
  const container = document.getElementById("cashflow-table-container");
  if (!container) return;

  if (!Array.isArray(cfData) || cfData.length === 0) {
    container.innerHTML = '<div class="section-error">無現金流資料</div>';
    return;
  }

  const sorted = [...cfData].sort((a, b) =>
    String(b["年季"]).localeCompare(String(a["年季"])),
  );

  // FCF 年度現金股利覆蓋倍數：取 TTM FCF / 最近年度現金股利
  const ttmFcf = ttmFreeCashflow(sorted);
  const latestAnnualDiv = annualDiv?.[0]?.年度現金股利;
  const coverage = ttmFcf != null ? safeDiv(ttmFcf, latestAnnualDiv) : null;

  // 注意：annualDiv 的現金股利是「每股」，TTM FCF 是「總額」，單位不一致。
  // 要換算需要股數。保守處理：覆蓋倍數需要總額除總額，暫以最近年度的「股利總發放額 = 年度現金股利 × 發行股數」估算。
  // 但 profile 未必有股數精確值，改採較穩妥的相對指標：
  // - 若 TTM FCF > 0 且 年度股利 > 0，顯示「✓ FCF 為正」、否則警示
  // 實務上，年度總股利發放額可從 cf 的「發放現金股利」欄位取得（更精確）。這裡先用簡化指標。
  const cashDivPaidSum = sorted
    .slice(0, 4)
    .reduce(
      (s, r) => s + (Number(r?.["發放現金股利"]) || 0),
      0,
    );
  const realCoverage =
    ttmFcf != null && cashDivPaidSum > 0
      ? safeDiv(ttmFcf, Math.abs(cashDivPaidSum))
      : null;

  const coverageCard = `
    <div class="bg-slate-800/50 rounded-lg p-3 mb-4 flex items-center gap-4">
      <div class="flex-1">
        <div class="text-xs text-muted">現金股利覆蓋倍數（TTM FCF ÷ TTM 現金股利發放）</div>
        <div class="text-2xl font-bold ${realCoverage == null ? "text-muted" : realCoverage >= 1 ? "val-up" : "val-down"}">
          ${realCoverage != null ? realCoverage.toFixed(2) + "x" : "—"}
        </div>
      </div>
      <div class="text-xs text-muted text-right">
        TTM FCF：${ttmFcf != null ? formatRevenue(ttmFcf * 1000) : "—"}<br>
        TTM 現金股利發放：${cashDivPaidSum ? formatRevenue(Math.abs(cashDivPaidSum) * 1000) : "—"}
      </div>
    </div>
  `;

  container.innerHTML =
    coverageCard +
    `
    <table class="data-table">
      <thead>
        <tr>
          <th>年季</th>
          <th>營業活動 (OCF)</th>
          <th>投資活動 (ICF)</th>
          <th>融資活動</th>
          <th>自由現金流量</th>
        </tr>
      </thead>
      <tbody>
        ${sorted
          .slice(0, 8)
          .map((r) => {
            const ocf = Number(r[FIELD.OCF]);
            const icf = Number(r[FIELD.ICF]);
            const ffn = Number(r[FIELD.FCF_FIN]);
            const fcf = Number(r[FIELD.FCF]);
            return `
              <tr>
                <td>${r["年季"] ?? ""}</td>
                <td>${Number.isFinite(ocf) ? formatRevenue(ocf * 1000) : "—"}</td>
                <td>${Number.isFinite(icf) ? formatRevenue(icf * 1000) : "—"}</td>
                <td>${Number.isFinite(ffn) ? formatRevenue(ffn * 1000) : "—"}</td>
                <td class="${Number.isFinite(fcf) ? (fcf >= 0 ? "val-up" : "val-down") : ""}">${Number.isFinite(fcf) ? formatRevenue(fcf * 1000) : "—"}</td>
              </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}
