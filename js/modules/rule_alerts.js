/**
 * 規則警示 chip — 即時計算版
 *
 * 資料來源：直接從已 fetch 的 Dottdot API 資料計算 7 條 sell rules，
 * 不依賴 Python pipeline / scorecard_web.json。任何有 API 資料的股票都能顯示。
 */

/**
 * 渲染規則警示 chip（Profile 區塊內、metric cards 下方）。
 *
 * @param {{ rules: Array<{code: string, name: string, triggered: boolean}>, alertCount: number }} ruleResult
 *        由 rule_engine.js 的 computeRuleAlerts() 產生
 */
export function renderRuleAlerts(ruleResult) {
  const el = document.getElementById("rule-alerts-container");
  if (!el) return;

  if (!ruleResult || !Array.isArray(ruleResult.rules)) {
    el.innerHTML = `
      <div class="rule-alerts rule-alerts-empty">
        <span class="muted">規則警示資料不足（API 資料量不夠計算）</span>
      </div>`;
    return;
  }

  const { rules, alertCount } = ruleResult;
  const totalRules = rules.length;
  const countClass =
    alertCount === 0
      ? "val-neutral"
      : alertCount >= 3
        ? "val-down"
        : "val-warn";

  const chipsHtml = rules
    .map((r) => {
      const cls = r.triggered ? "chip chip-triggered" : "chip chip-off";
      const dot = r.triggered ? "●" : "○";
      return `<span class="${cls}">${dot} ${r.code} ${r.name}</span>`;
    })
    .join("");

  el.innerHTML = `
    <div class="rule-alerts">
      <div class="rule-alerts-header">
        <span class="rule-alerts-title">規則警示</span>
        <span class="rule-alerts-summary">
          警示 <strong class="${countClass}">${alertCount}/${totalRules}</strong>
        </span>
      </div>
      <div class="rule-chips">${chipsHtml}</div>
    </div>
  `;
}
