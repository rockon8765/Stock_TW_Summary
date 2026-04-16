/**
 * 前端 Rule Engine — 即時計算 7 條 sell rules
 *
 * 對齊 ScoreCard_V2_New/rule_build.py 的 S10/S11/S12/S13/S17/S20/S22。
 * 全部從 Dottdot API 已 fetch 的資料計算，不依賴 Python pipeline。
 *
 * 每條 rule 回傳 boolean（true = triggered / 警示）。
 */

/** 由新到舊排序 helper */
function sortDesc(arr, key) {
  return [...(arr || [])].sort((a, b) =>
    String(b[key]).localeCompare(String(a[key])),
  );
}

/**
 * S10：累積營收連續三個月YOY衰退10%
 * 資料：monthsales 的 `累計合併營收成長` 欄位（百分比）
 * 觸發：最近 3 個月的 累計合併營收成長 都 < -10
 */
function checkS10(monthsales) {
  if (!monthsales || monthsales.length < 3) return false;
  const sorted = sortDesc(monthsales, "年月");
  for (let i = 0; i < 3; i++) {
    const v = Number(sorted[i]?.["累計合併營收成長"]);
    if (!Number.isFinite(v) || v >= -10) return false;
  }
  return true;
}

/**
 * S11：連續兩季單季稅後淨利YOY衰退5%
 * 資料：is_quarterly 的 `稅後純益`
 * 觸發：最近 2 季各自與去年同季比較，YOY 都 < -5%
 */
function checkS11(incomeQ) {
  return checkQuarterlyYOYDecline(incomeQ, "稅後純益", -5, 2);
}

/**
 * S12：連續兩季單季營業利益YOY衰退5%
 */
function checkS12(incomeQ) {
  return checkQuarterlyYOYDecline(incomeQ, "營業利益", -5, 2);
}

/**
 * 共用：檢查最近 N 季的 YOY 是否都低於 threshold%
 * 需要至少 N+4 季的資料（最近 N 季各需與 4 季前比較）
 */
function checkQuarterlyYOYDecline(incomeQ, field, thresholdPct, consecutive) {
  if (!incomeQ || incomeQ.length < consecutive + 4) return false;
  const sorted = sortDesc(incomeQ, "年季");
  for (let i = 0; i < consecutive; i++) {
    const current = Number(sorted[i]?.[field]);
    const yearAgo = Number(sorted[i + 4]?.[field]);
    if (!Number.isFinite(current) || !Number.isFinite(yearAgo) || yearAgo === 0)
      return false;
    const yoy = ((current - yearAgo) / Math.abs(yearAgo)) * 100;
    if (yoy >= thresholdPct) return false;
  }
  return true;
}

/**
 * S13：今年以來稅後獲利衰退YOY達10%
 * 資料：is_quarterly 的 `稅後純益`
 * 觸發：今年 YTD 稅後純益合計 vs 去年同期 YTD 合計，衰退 >= 10%
 */
function checkS13(incomeQ) {
  if (!incomeQ || incomeQ.length < 5) return false;
  const sorted = sortDesc(incomeQ, "年季");

  // 最新季的年份
  const latestYQ = String(sorted[0]?.["年季"] ?? "");
  const latestYear = latestYQ.slice(0, 4);
  const lastYear = String(Number(latestYear) - 1);

  // 今年累計
  let ytdCurrent = 0;
  let ytdCount = 0;
  for (const r of sorted) {
    if (String(r["年季"]).startsWith(latestYear)) {
      ytdCurrent += Number(r["稅後純益"]) || 0;
      ytdCount++;
    }
  }
  if (ytdCount === 0) return false;

  // 去年同期累計（相同季數）
  let ytdPrev = 0;
  let prevCount = 0;
  for (const r of sorted) {
    if (String(r["年季"]).startsWith(lastYear) && prevCount < ytdCount) {
      ytdPrev += Number(r["稅後純益"]) || 0;
      prevCount++;
    }
  }
  if (prevCount === 0 || ytdPrev === 0) return false;

  const yoy = ((ytdCurrent - ytdPrev) / Math.abs(ytdPrev)) * 100;
  return yoy < -10;
}

/**
 * S17：PB百分位大於80%
 * 資料：dailyquotes 的 `股價淨值比`（5Y 日頻）
 * 觸發：當前 PB 在過去 5 年歷史分布中排在 80% 以上
 */
function checkS17(quotes) {
  if (!quotes || quotes.length < 250) return false;

  const pbValues = quotes
    .map((r) => Number(r["股價淨值比"]))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (pbValues.length < 250) return false;

  const currentPB = pbValues[pbValues.length - 1]; // 最新值（日期升冪排序的最後一筆）
  // 找升冪排序最新一天的 PB
  const sortedAsc = [...quotes].sort((a, b) =>
    String(a["日期"]).localeCompare(String(b["日期"])),
  );
  const latestPB = Number(sortedAsc[sortedAsc.length - 1]?.["股價淨值比"]);
  if (!Number.isFinite(latestPB) || latestPB <= 0) return false;

  const sorted = [...pbValues].sort((a, b) => a - b);
  const rank = sorted.filter((v) => v <= latestPB).length;
  const percentile = rank / sorted.length;
  return percentile > 0.8;
}

/**
 * S20：單季營收連兩季衰退（實作用月營收 YOY < 0 連續 2 個月）
 * 資料：monthsales 的 `單月合併營收年成長`（百分比）
 * 觸發：最近 2 個月的 單月合併營收年成長 都 < 0
 *
 * 備註：規則名稱寫「季」但 Python 實作 (rule_build.py:363-372) 用月資料。
 * 這裡跟隨 Python 實作。
 */
function checkS20(monthsales) {
  if (!monthsales || monthsales.length < 2) return false;
  const sorted = sortDesc(monthsales, "年月");
  for (let i = 0; i < 2; i++) {
    const v = Number(sorted[i]?.["單月合併營收年成長"]);
    if (!Number.isFinite(v) || v >= 0) return false;
  }
  return true;
}

/**
 * S22：股票跌破年線且比大盤弱10%
 * 資料：dailyquotes 的 `收盤價`（計算 250MA）+ dailystatistics 的 `Alpha250D`
 * 觸發：收盤價 < 250日均線 AND Alpha250D < -0.10
 *
 * 備註：原 Python 用 `df_與大盤比年報酬率` 欄位；JS 端改用 Alpha250D 做近似
 * （Alpha 衡量扣除市場因素後的超額報酬，負值表示跑輸大盤）。
 */
function checkS22(quotes, stats) {
  if (!quotes || quotes.length < 250) return false;

  // 計算 250 日均線
  const sortedAsc = [...quotes].sort((a, b) =>
    String(a["日期"]).localeCompare(String(b["日期"])),
  );
  const closes = sortedAsc
    .map((r) => Number(r["收盤價"]))
    .filter(Number.isFinite);
  if (closes.length < 250) return false;

  const recent250 = closes.slice(-250);
  const ma250 = recent250.reduce((s, v) => s + v, 0) / 250;
  const latestClose = closes[closes.length - 1];

  const belowMA = latestClose < ma250;

  // Alpha250D 檢查
  if (!stats || stats.length === 0) return false;
  const sortedStats = [...stats].sort((a, b) =>
    String(b["日期"]).localeCompare(String(a["日期"])),
  );
  const alpha = Number(sortedStats[0]?.["Alpha250D"]);
  const underperform = Number.isFinite(alpha) && alpha < -0.1;

  return belowMA && underperform;
}

/**
 * 主入口：計算 7 條 sell rules 的觸發狀態。
 *
 * @param {Object} params
 * @param {Array<Object>|null} params.monthsales md_cm_fi_monthsales（12 月）
 * @param {Array<Object>|null} params.incomeQ     md_cm_fi_is_quarterly（8Q）
 * @param {Array<Object>|null} params.quotes      md_cm_ta_dailyquotes（5Y 日頻）
 * @param {Array<Object>|null} params.stats       md_cm_ta_dailystatistics（5Y 日頻）
 * @returns {{ rules: Array<{code: string, name: string, triggered: boolean}>, alertCount: number }}
 */
export function computeRuleAlerts({ monthsales, incomeQ, quotes, stats }) {
  const rules = [
    {
      code: "S10",
      name: "累積營收連續三個月YOY衰退10%",
      triggered: checkS10(monthsales),
    },
    {
      code: "S11",
      name: "連續兩季單季稅後淨利YOY衰退5%",
      triggered: checkS11(incomeQ),
    },
    {
      code: "S12",
      name: "連續兩季單季營業利益YOY衰退5%",
      triggered: checkS12(incomeQ),
    },
    {
      code: "S13",
      name: "今年以來稅後獲利衰退YOY達10%",
      triggered: checkS13(incomeQ),
    },
    {
      code: "S20",
      name: "單季營收連兩季衰退",
      triggered: checkS20(monthsales),
    },
    {
      code: "S22",
      name: "股票跌破年線且比大盤弱10%",
      triggered: checkS22(quotes, stats),
    },
    {
      code: "S17",
      name: "PB百分位大於80%",
      triggered: checkS17(quotes),
    },
  ];

  const alertCount = rules.filter((r) => r.triggered).length;
  return { rules, alertCount };
}
