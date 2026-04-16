import { formatNumber, formatPercent, FIELD, safeDiv, cagr } from "../utils.js";

/**
 * 找 5Y CAGR 所需的 (end, start, years) 三元組：
 *   end   = 最新一年的值
 *   start = 5 年前的值（若資料不足則取最早可得年，並使用實際年差）
 * 回傳 { end, start, years }
 */
function fiveYearEnds(sortedDesc, field) {
  if (!Array.isArray(sortedDesc) || sortedDesc.length === 0) return null;
  const endRow = sortedDesc[0];
  const endYear = Number(endRow["年度"]);
  const endVal = Number(endRow[field]);
  if (!Number.isFinite(endYear) || !Number.isFinite(endVal)) return null;

  // 嘗試找恰好 5 年前的值
  const targetYear = endYear - 5;
  const startRow =
    sortedDesc.find((r) => Number(r["年度"]) === targetYear) ??
    sortedDesc[sortedDesc.length - 1];
  const startYear = Number(startRow["年度"]);
  const startVal = Number(startRow[field]);
  if (!Number.isFinite(startYear) || !Number.isFinite(startVal)) return null;

  const years = endYear - startYear;
  if (years <= 0) return null;
  return { end: endVal, start: startVal, years };
}

function cagrFromPair(sortedDesc, field) {
  const t = fiveYearEnds(sortedDesc, field);
  if (!t) return null;
  return cagr(t.end, t.start, t.years);
}

function card(label, value, suffix, decimals, tone) {
  const display =
    value != null && Number.isFinite(Number(value))
      ? formatNumber(value, decimals) + suffix
      : "—";
  const toneClass =
    tone === "up" ? "val-up" : tone === "down" ? "val-down" : "";
  return `
    <div class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value ${toneClass}">${display}</div>
    </div>
  `;
}

/**
 * 渲染「5 年長期趨勢」：
 *   - 4 張 CAGR 卡：營收、EPS、現金股利、每股淨值（近 5 年複合年增率）
 *   - 近 5 年 ROE/ROA 年度表
 *
 * @param {Array<Object>|null|undefined} annualIs  is_annual 近 10 年
 * @param {Array<Object>|null|undefined} annualBs  bs_annual 近 10 年
 * @param {Array<Object>}                 annualDiv 聚合後年度股利
 */
export function renderLongTermTrend(annualIs, annualBs, annualDiv) {
  const container = document.getElementById("longterm-trend-container");
  if (!container) return;

  const isDesc = [...(annualIs ?? [])].sort(
    (a, b) => Number(b["年度"]) - Number(a["年度"]),
  );
  const bsDesc = [...(annualBs ?? [])].sort(
    (a, b) => Number(b["年度"]) - Number(a["年度"]),
  );

  if (isDesc.length === 0 && bsDesc.length === 0) {
    container.innerHTML = '<div class="section-error">無年度財報資料</div>';
    return;
  }

  // 每股淨值 = 母公司業主權益 / 普通股股數（簡化：取 bs 的「每股淨值」若有）
  // 若 bs 沒有該欄位，可用權益/股本估算，但各表欄位不一；此處先不算 BV CAGR，
  // 改在 quotes 側由 profile 顯示。長期趨勢卡以 BV 計算改為「權益」CAGR 作替代。

  // 1. 營收 CAGR
  const revCagr = cagrFromPair(isDesc, FIELD.REVENUE);
  // 2. EPS CAGR
  const epsCagr = cagrFromPair(isDesc, FIELD.EPS);
  // 3. 現金股利 CAGR（用 annualDiv 年度現金股利）
  const divSorted = [...(annualDiv ?? [])]
    .map((d) => ({ 年度: Number(d.年度), value: d.年度現金股利 }))
    .sort((a, b) => b.年度 - a.年度);
  let divCagr = null;
  if (divSorted.length > 0) {
    const endYear = divSorted[0].年度;
    const target = endYear - 5;
    const startRow =
      divSorted.find((r) => r.年度 === target) ??
      divSorted[divSorted.length - 1];
    const years = endYear - startRow.年度;
    if (years > 0) divCagr = cagr(divSorted[0].value, startRow.value, years);
  }
  // 4. 權益 CAGR（母公司業主權益）— 代替 BV CAGR
  const equityCagr = cagrFromPair(bsDesc, FIELD.EQUITY_PARENT);

  // 近 5 年 ROE / ROA 年度數字
  // 年度 ROE = 母公司業主–稅後純益(當年) / ((當年 + 前一年) 母公司業主權益 平均)
  // 年度 ROA = 稅後純益(當年) / ((當年 + 前一年) 資產總計 平均)
  const recentYears = isDesc.slice(0, 5);
  const rows = recentYears.map((r) => {
    const y = Number(r["年度"]);
    const prevBs = bsDesc.find((b) => Number(b["年度"]) === y - 1);
    const curBs = bsDesc.find((b) => Number(b["年度"]) === y);
    const eqAvg =
      prevBs && curBs
        ? (Number(prevBs[FIELD.EQUITY_PARENT]) +
            Number(curBs[FIELD.EQUITY_PARENT])) /
          2
        : Number(curBs?.[FIELD.EQUITY_PARENT]) || null;
    const assetAvg =
      prevBs && curBs
        ? (Number(prevBs[FIELD.ASSET_TOTAL]) +
            Number(curBs[FIELD.ASSET_TOTAL])) /
          2
        : Number(curBs?.[FIELD.ASSET_TOTAL]) || null;

    const roe = safeDiv(Number(r[FIELD.NI_PARENT]), eqAvg);
    const roa = safeDiv(Number(r[FIELD.AFTERTAX]), assetAvg);
    return { year: y, roe, roa };
  });

  const toPct = (v) => (v != null ? v * 100 : null);

  container.innerHTML = `
    <div class="metric-cards mb-4">
      ${card("營收 5Y CAGR", revCagr != null ? revCagr * 100 : null, "%", 2, null)}
      ${card("EPS 5Y CAGR", epsCagr != null ? epsCagr * 100 : null, "%", 2, null)}
      ${card("現金股利 5Y CAGR", divCagr != null ? divCagr * 100 : null, "%", 2, null)}
      ${card("權益 5Y CAGR", equityCagr != null ? equityCagr * 100 : null, "%", 2, null)}
    </div>
    <div class="overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>年度</th>
            <th>ROE</th>
            <th>ROA</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td>${r.year}</td>
              <td>${r.roe != null ? formatPercent(toPct(r.roe)) : "—"}</td>
              <td>${r.roa != null ? formatPercent(toPct(r.roa)) : "—"}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}
