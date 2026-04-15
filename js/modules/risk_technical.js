import { formatNumber } from "../utils.js";

/**
 * 從日頻技術統計挑出最近 12 個月末的值（monthly snapshot）。
 * @param {Array<Object>} sortedAsc 已由舊到新排序
 * @returns {Array<Object>} 每月最後一筆，由新到舊
 */
function pickMonthEnds(sortedAsc) {
  const byMonth = new Map();
  for (const row of sortedAsc) {
    const date = String(row?.["日期"] ?? "");
    if (date.length < 7) continue;
    const ym = date.slice(0, 7);
    byMonth.set(ym, row); // 後蓋前 → 該月最後一筆
  }
  const all = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  return all.slice(0, 12).map((e) => e[1]);
}

function card(label, value, suffix = "", decimals = 2, tone = null) {
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
 * 渲染風險與技術面區塊：
 *   - 5 張風險/技術統計卡（Beta250D / Beta65D / 年化波動度250D / Alpha250D / 乖離率250日）
 *   - 月頻趨勢小表（近 12 月末值：月 K9 / 月 D9 / 月 RSI10）
 *
 * @param {Array<Object>|null|undefined} statsData md_cm_ta_dailystatistics（5Y 日頻）
 */
export function renderRiskTechnical(statsData) {
  const container = document.getElementById("risk-tech-container");
  if (!container) return;

  if (!Array.isArray(statsData) || statsData.length === 0) {
    container.innerHTML = '<div class="section-error">無技術指標資料</div>';
    return;
  }

  const sortedAsc = [...statsData].sort((a, b) =>
    String(a["日期"]).localeCompare(String(b["日期"])),
  );
  const latest = sortedAsc[sortedAsc.length - 1] || {};
  const monthEnds = pickMonthEnds(sortedAsc);

  const beta250 = Number(latest["Beta係數250D"]); // 純比率
  const beta65 = Number(latest["Beta係數65D"]);
  // API 年化波動度、Alpha 以 decimal 回傳（0.33 = 33%），顯示需 × 100
  const vol250Raw = Number(latest["年化波動度250D"]);
  const vol250 = Number.isFinite(vol250Raw) ? vol250Raw * 100 : null;
  const alpha250Raw = Number(latest["Alpha250D"]);
  const alpha250 = Number.isFinite(alpha250Raw) ? alpha250Raw * 100 : null;
  const dev250 = Number(latest["乖離率250日"]); // API 已為 %

  // Beta 高風險（>1.2）顯示 down（紅警示）；<0.8 顯示 up（綠穩健）
  const betaTone =
    Number.isFinite(beta250) && beta250 > 1.2
      ? "down"
      : Number.isFinite(beta250) && beta250 < 0.8
        ? "up"
        : null;

  const cards = `
    <div class="metric-cards mb-4">
      ${card("Beta 250D", beta250, "", 2, betaTone)}
      ${card("Beta 65D", beta65, "", 2)}
      ${card("年化波動度 250D", vol250, "%", 2)}
      ${card("Alpha 250D", alpha250, "%", 2)}
      ${card("乖離率 250 日", dev250, "%", 2)}
    </div>
  `;

  const trendTable = `
    <div class="overflow-x-auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>月份</th>
            <th>月 K9</th>
            <th>月 D9</th>
            <th>月 RSI10</th>
            <th>月 MACD</th>
          </tr>
        </thead>
        <tbody>
          ${monthEnds
            .map((r) => {
              const ym = String(r["日期"] ?? "").slice(0, 7);
              return `
                <tr>
                  <td>${ym}</td>
                  <td>${formatNumber(r["月K9"], 2)}</td>
                  <td>${formatNumber(r["月D9"], 2)}</td>
                  <td>${formatNumber(r["月RSI10"], 2)}</td>
                  <td>${formatNumber(r["月MACD"], 3)}</td>
                </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = cards + trendTable;
}
