/**
 * 規則警示表格 — 即時計算版
 *
 * 資料來源：直接從已 fetch 的 Dottdot API 資料計算 7 條 sell rules，
 * 不依賴 strategy snapshot / scorecard_web.json。任何有 API 資料的股票都能顯示。
 */
import { escapeHtml } from "../utils.js";

const PERIOD_COUNT = 6;

const FREQUENCY_LABELS = {
  monthly: "月",
  quarterly: "季",
  monthEndDaily: "日(月末)",
};

function countClass(alertCount) {
  if (alertCount === 0) return "val-neutral";
  return alertCount >= 3 ? "val-down" : "val-warn";
}

function normalizePeriods(rule) {
  const periods = Array.isArray(rule.periods)
    ? rule.periods.slice(0, PERIOD_COUNT)
    : [];
  while (periods.length < PERIOD_COUNT) {
    periods.unshift({ label: "—", triggered: null, detail: "資料不足" });
  }
  return periods;
}

function dotMeta(triggered) {
  if (triggered === true)
    return { className: "dot dot-on", symbol: "●" };
  if (triggered === false)
    return { className: "dot dot-off", symbol: "○" };
  return { className: "dot dot-na", symbol: "—" };
}

function renderSummary(ruleResult, rules) {
  const latestAlertCount =
    ruleResult.latestAlertCount ??
    ruleResult.alertCount ??
    rules.filter((rule) => rule.triggered).length;
  const latestAvailableCount =
    ruleResult.latestAvailableCount ??
    rules.filter((rule) => rule.latest != null && rule.latest.triggered !== null).length;
  const latestNaCount =
    ruleResult.latestNaCount ?? Math.max(0, rules.length - latestAvailableCount);

  if (latestAvailableCount === 0) return "即時規則警示資料不足";

  const naSuffix = latestNaCount > 0 ? `，資料不足 ${latestNaCount}` : "";
  return `本期警示 <strong class="${countClass(latestAlertCount)}">${latestAlertCount}/${latestAvailableCount}</strong>${naSuffix}`;
}

function renderPeriodCell(period) {
  const label = escapeHtml(period?.label || "—");
  const title = escapeHtml(
    `${period?.label || "—"} · ${period?.detail || "資料不足"}`,
  );
  const dot = dotMeta(period?.triggered);

  return `
    <td title="${title}">
      <div class="cell">
        <div class="cell-label">${label}</div>
        <div class="${dot.className}">${dot.symbol}</div>
      </div>
    </td>`;
}

function renderRuleRow(rule) {
  const periods = normalizePeriods(rule);
  const frequencyLabel = FREQUENCY_LABELS[rule.frequency] ?? rule.frequency ?? "";
  const rowTitle = escapeHtml(rule.detail || rule.name || rule.code || "");

  return `
    <tr>
      <th scope="row" title="${rowTitle}">
        <div class="rule-row-header">
          <span class="rule-name">${escapeHtml(rule.name)}</span>
          ${frequencyLabel ? `<span class="rule-cat-badge">${escapeHtml(frequencyLabel)}</span>` : ""}
        </div>
      </th>
      ${periods.map(renderPeriodCell).join("")}
    </tr>`;
}

/**
 * 渲染規則警示表格（Profile 區塊內、metric cards 下方）。
 *
 * @param {{ rules: Array<{code: string, name: string, frequency?: string, detail?: string, periods?: Array<{label: string, triggered: boolean|null, detail?: string}>, latest?: {triggered: boolean|null}, triggered: boolean}>, alertCount: number, latestAlertCount?: number, latestAvailableCount?: number, latestNaCount?: number }} ruleResult
 *        由 rule_engine.js 的 computeRuleAlerts() 產生
 */
export function renderRuleAlerts(ruleResult) {
  const el = document.getElementById("rule-alerts-container");
  if (!el) return;

  if (!ruleResult || !Array.isArray(ruleResult.rules)) {
    el.innerHTML = `
      <div class="rule-alerts rule-alerts-empty">
        <span class="muted">即時規則警示資料不足（Live API 資料量不夠計算）</span>
      </div>`;
    return;
  }

  const rules = ruleResult.rules;
  const summary = renderSummary(ruleResult, rules);

  el.innerHTML = `
    <div class="rule-alerts">
      <div class="rule-alerts-header">
        <span class="rule-alerts-title">即時規則警示（Live API 近似訊號 · 近 6 期）</span>
        <span class="rule-alerts-summary">${summary}</span>
      </div>
      <div class="rule-alerts-summary">部分規則為前端即時近似訊號，可能與 ScoreCard 快照不同。資料不足以計算的儲存格顯示 —。</div>
      <div class="rule-alerts-table-scroll">
        <table class="rule-alerts-table">
          <tbody>
            ${rules.map(renderRuleRow).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
