import {
  FIELD,
  formatNumber,
  formatPercent,
  safeDiv,
  sortDescByKey,
} from "../utils.js";

/** 取前 N 季某欄位之加總（TTM 可取 N=4） */
function sumTopN(arr, field, n) {
  if (!Array.isArray(arr) || arr.length < n) return null;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = Number(arr[i]?.[field]);
    if (!Number.isFinite(v)) return null;
    sum += v;
  }
  return sum;
}

/** 取前後兩季平均（期初期末平均法） */
function avgBeginEnd(arr, field) {
  if (!Array.isArray(arr) || arr.length < 2) return null;
  const latest = Number(arr[0]?.[field]);
  // 期初：4 季前（年同期），若不夠則取最早一筆
  const beginIdx = arr.length >= 5 ? 4 : arr.length - 1;
  const begin = Number(arr[beginIdx]?.[field]);
  if (!Number.isFinite(latest) || !Number.isFinite(begin)) return null;
  return (latest + begin) / 2;
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
 * 渲染「財務比率儀表板」6 張卡片。
 *
 * 公式說明（所有除法透過 safeDiv 處理 0/NaN）：
 *   1. ROE_TTM = 母公司業主–稅後純益 TTM / avg(期初期末 母公司業主權益)
 *   2. ROA_TTM = 稅後純益 TTM / avg(期初期末 資產總計)
 *   3. 負債比 = 負債總計 / 資產總計（最新季）
 *   4. 流動比 = 流動資產 / 流動負債
 *   5. 利息保障倍數 = (稅前純益 + 利息費用) / 利息費用
 *   6. FCF 股利覆蓋率 = TTM 自由現金流量 / TTM 發放現金股利
 *
 * @param {Object} params
 * @param {Array<Object>|null|undefined} params.incomeQ is_quarterly 8Q
 * @param {Array<Object>|null|undefined} params.bsQ     bs_quarterly 8Q
 * @param {Array<Object>|null|undefined} params.cfQ    cf_quarterly 8Q
 */
export function renderFinancialRatios({ incomeQ, bsQ, cfQ }) {
  const container = document.getElementById("ratios-dashboard-container");
  if (!container) return;

  const incDesc = sortDescByKey(incomeQ, "年季");
  const bsDesc = sortDescByKey(bsQ, "年季");
  const cfDesc = sortDescByKey(cfQ, "年季");

  // 1. ROE_TTM
  const niTTM = sumTopN(incDesc, FIELD.NI_PARENT, 4);
  const avgEquityParent = avgBeginEnd(bsDesc, FIELD.EQUITY_PARENT);
  const roe =
    niTTM != null && avgEquityParent != null
      ? safeDiv(niTTM, avgEquityParent)
      : null;

  // 2. ROA_TTM
  const netTTM = sumTopN(incDesc, FIELD.AFTERTAX, 4);
  const avgAsset = avgBeginEnd(bsDesc, FIELD.ASSET_TOTAL);
  const roa =
    netTTM != null && avgAsset != null ? safeDiv(netTTM, avgAsset) : null;

  // 3. 負債比（最新季）
  const latestBs = bsDesc[0];
  const debtRatio = latestBs
    ? safeDiv(
        Number(latestBs[FIELD.LIAB_TOTAL]),
        Number(latestBs[FIELD.ASSET_TOTAL]),
      )
    : null;

  // 4. 流動比
  const currentRatio = latestBs
    ? safeDiv(
        Number(latestBs[FIELD.CURRENT_ASSET]),
        Number(latestBs[FIELD.CURRENT_LIAB]),
      )
    : null;

  // 5. 利息保障倍數 = (稅前純益 + 利息費用) / 利息費用
  // TTM 版：4 季加總
  const pretaxTTM = sumTopN(incDesc, FIELD.PRETAX, 4);
  const interestTTM = sumTopN(incDesc, FIELD.INTEREST_EXPENSE, 4);
  const interestCoverage =
    pretaxTTM != null && interestTTM != null
      ? safeDiv(pretaxTTM + interestTTM, interestTTM)
      : null;

  // 6. FCF 股利覆蓋率 = TTM FCF / TTM 發放現金股利（取絕對值，因 cf 流出為負）
  const fcfTTM = sumTopN(cfDesc, FIELD.FCF, 4);
  const cashDivTTM = sumTopN(cfDesc, "發放現金股利", 4);
  const fcfCoverage =
    fcfTTM != null && cashDivTTM != null && cashDivTTM !== 0
      ? safeDiv(fcfTTM, Math.abs(cashDivTTM))
      : null;

  // 警示色規則（for 壽險決策）
  const debtTone =
    debtRatio != null && debtRatio > 0.5
      ? "down"
      : debtRatio != null && debtRatio < 0.3
        ? "up"
        : null;
  const currentTone =
    currentRatio != null && currentRatio < 1
      ? "down"
      : currentRatio != null && currentRatio > 2
        ? "up"
        : null;
  const interestTone =
    interestCoverage != null && interestCoverage < 3
      ? "down"
      : interestCoverage != null && interestCoverage > 10
        ? "up"
        : null;
  const fcfCovTone =
    fcfCoverage != null && fcfCoverage < 1
      ? "down"
      : fcfCoverage != null && fcfCoverage > 2
        ? "up"
        : null;

  container.innerHTML = `
    ${card("ROE (TTM)", roe != null ? roe * 100 : null, "%", 2, null)}
    ${card("ROA (TTM)", roa != null ? roa * 100 : null, "%", 2, null)}
    ${card("負債比", debtRatio != null ? debtRatio * 100 : null, "%", 2, debtTone)}
    ${card("流動比", currentRatio, "x", 2, currentTone)}
    ${card("利息保障倍數", interestCoverage, "x", 1, interestTone)}
    ${card("FCF 股利覆蓋", fcfCoverage, "x", 2, fcfCovTone)}
  `;
}
