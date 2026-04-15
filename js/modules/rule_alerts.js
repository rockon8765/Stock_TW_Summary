import { formatPercent } from "../utils.js";

/**
 * 渲染規則警示 chip（Profile 區塊內）。
 *
 * 資料來源：scorecard_web.json
 *   - 全域 rules_meta：7 條 sell rule 的 code + 名稱
 *   - tickerData.alerts.triggered_codes：該 ticker 最近一筆觸發的 rule code 陣列
 *   - tickerData.alerts.alert_count / expected_yield / category：摘要數字
 *
 * Graceful：
 *   - scorecard null（JSON 不存在）→ 顯示「執行 export_scorecard_to_web.py 後重新整理」
 *   - ticker 不在 scorecard.tickers → 顯示「此股未納入 ScoreCard 追蹤」
 *   - ticker 在但 alerts == null → 同上（watchlist 外）
 *
 * @param {{ rules_meta: Array, tickers: Object, as_of: string }|null} scorecard
 * @param {string} ticker
 */
export function renderRuleAlerts(scorecard, ticker) {
  const el = document.getElementById("rule-alerts-container");
  if (!el) return;

  if (!scorecard) {
    el.innerHTML = `
      <div class="rule-alerts rule-alerts-empty">
        <span class="muted">規則警示資料未就緒（請先跑 <code>ScoreCard_V2_New/export_scorecard_to_web.py</code> 產生 scorecard_web.json）</span>
      </div>`;
    return;
  }

  const tickerData = scorecard.tickers?.[String(ticker)];
  const alerts = tickerData?.alerts;
  if (!alerts) {
    el.innerHTML = `
      <div class="rule-alerts rule-alerts-empty">
        <span class="muted">此股未納入 ScoreCard 追蹤（不在 Eason 篩選表 V2 watchlist）</span>
      </div>`;
    return;
  }

  const rulesMeta = scorecard.rules_meta || [];
  const triggered = new Set(alerts.triggered_codes || []);
  const alertCount = alerts.alert_count ?? triggered.size;
  const totalRules = rulesMeta.length || 7;
  const countClass =
    alertCount === 0 ? "val-neutral" : alertCount >= 3 ? "val-down" : "val-warn";

  const chipsHtml = rulesMeta
    .map((r) => {
      const on = triggered.has(r.code);
      const cls = on ? "chip chip-triggered" : "chip chip-off";
      const dot = on ? "●" : "○";
      return `<span class="${cls}" title="${r.name}">${dot} ${r.code}</span>`;
    })
    .join("");

  const catBadge = alerts.category
    ? `<span class="rule-cat-badge">${alerts.category}</span>`
    : "";
  const asOfStr = scorecard.as_of || "";
  const yieldStr =
    alerts.expected_yield != null
      ? `預估殖利率 <strong>${formatPercent(alerts.expected_yield)}</strong>`
      : "";

  el.innerHTML = `
    <div class="rule-alerts">
      <div class="rule-alerts-header">
        <span class="rule-alerts-title">
          規則警示 ${catBadge}
          <span class="muted">（as of ${asOfStr}）</span>
        </span>
        <span class="rule-alerts-summary">
          警示 <strong class="${countClass}">${alertCount}/${totalRules}</strong>
          ${yieldStr ? "｜ " + yieldStr : ""}
        </span>
      </div>
      <div class="rule-chips">${chipsHtml}</div>
    </div>
  `;
}
