import {
  fetchDailyQuotes,
  fetchCompanyProfile,
  fetchMonthSales,
  fetchQuarterlyIncome,
  fetchQuarterlyBS,
  fetchDividendPolicy,
  fetchForeignTrading,
  fetchTrustTrading,
  fetchBrokerTrading,
  fetchShareholderStructure,
  fetchQuarterlyCashflow,
  fetchDailyStatistics,
  fetchInsiderStructure,
  fetchAnnualIncome,
  fetchAnnualBS,
  fetchStrategySnapshot,
} from "./api.js";
import { renderProfile } from "./modules/profile.js";
import { renderValuation } from "./modules/valuation.js";
import { renderDividend } from "./modules/dividend.js";
import { renderKline } from "./charts/kline.js";
import { renderRevenue } from "./modules/revenue.js";
import { renderIncome } from "./modules/income.js";
import { renderInstitutional } from "./modules/institutional.js";
import { renderShareholders } from "./modules/shareholders.js";
import { loadStrategyData, renderStrategy } from "./modules/strategy.js";
import { renderCashflow } from "./modules/cashflow.js";
import { renderFinancialRatios } from "./modules/financial_ratios.js";
import { renderRiskTechnical } from "./modules/risk_technical.js";
import { renderInsiderGovernance } from "./modules/insider_governance.js";
import { renderLongTermTrend } from "./modules/long_term_trend.js";
import { renderRuleAlerts } from "./modules/rule_alerts.js";
import { renderStrategyScores } from "./modules/strategy_scores.js";
import { computeRuleAlerts } from "./lib/rule_engine.js";
import { aggregateDividendsToAnnual } from "./lib/dividend_aggregator.js";
import { showError } from "./utils.js";

let abortController = null;

// 策略分數是全域 snapshot（非 per-ticker）：首次查詢連同載入、後續切 ticker 走快取。
let strategySnapshotData = null;
let strategySnapshotLoadedOnce = false;

const tickerInput = document.getElementById("ticker-input");
const searchBtn = document.getElementById("search-btn");
const welcomeMsg = document.getElementById("welcome-msg");
const dataContainer = document.getElementById("data-container");

function resetSections() {
  const skeletons = {
    "profile-content":
      '<div class="skeleton h-6 w-48 mb-3"></div><div class="skeleton h-4 w-96"></div>',
    "valuation-table-container":
      '<div class="section-loading"><div class="skeleton h-64 w-full rounded-lg"></div></div>',
    "dividend-table-container":
      '<div class="section-loading"><div class="skeleton h-64 w-full rounded-lg"></div></div>',
    "revenue-table-container":
      '<div class="section-loading"><div class="skeleton h-40 w-full rounded-lg"></div></div>',
    "income-table-container":
      '<div class="section-loading"><div class="skeleton h-64 w-full rounded-lg"></div></div>',
    "institutional-table-container":
      '<div class="section-loading"><div class="skeleton h-64 w-full rounded-lg"></div></div>',
    "institutional-cards":
      '<div class="section-loading"><div class="skeleton h-24 w-full rounded-lg"></div></div><div class="section-loading"><div class="skeleton h-24 w-full rounded-lg"></div></div><div class="section-loading"><div class="skeleton h-24 w-full rounded-lg"></div></div>',
    "shareholders-table-container":
      '<div class="section-loading"><div class="skeleton h-64 w-full rounded-lg"></div></div>',
    "kline-chart":
      '<div class="section-loading h-full flex items-center justify-center"><div class="skeleton h-full w-full rounded-lg"></div></div>',
    "strategy-holding-container":
      '<div class="section-loading"><div class="skeleton h-48 w-full rounded-lg"></div></div>',
    "strategy-trade-container":
      '<div class="section-loading"><div class="skeleton h-48 w-full rounded-lg"></div></div>',
    "ratios-dashboard-container":
      '<div class="section-loading"><div class="skeleton h-20 w-full rounded-lg"></div></div>'.repeat(
        6,
      ),
    "cashflow-table-container":
      '<div class="section-loading"><div class="skeleton h-64 w-full rounded-lg"></div></div>',
    "longterm-trend-container":
      '<div class="section-loading"><div class="skeleton h-64 w-full rounded-lg"></div></div>',
    "governance-table-container":
      '<div class="section-loading"><div class="skeleton h-64 w-full rounded-lg"></div></div>',
    "risk-tech-container":
      '<div class="section-loading"><div class="skeleton h-48 w-full rounded-lg"></div></div>',
    "rule-alerts-container":
      '<div class="section-loading"><div class="skeleton h-12 w-full rounded-lg"></div></div>',
    "strategy-scores-container":
      '<div class="section-loading"><div class="skeleton h-48 w-full rounded-lg"></div></div>',
  };
  for (const [id, html] of Object.entries(skeletons)) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
}

async function search(ticker) {
  if (!ticker) return;

  if (abortController) abortController.abort();
  abortController = new AbortController();
  const { signal } = abortController;

  welcomeMsg.classList.add("hidden");
  dataContainer.classList.remove("hidden");
  resetSections();

  const tasks = [
    { key: "quotes", fn: () => fetchDailyQuotes(ticker, signal) },
    { key: "profile", fn: () => fetchCompanyProfile(ticker, signal) },
    { key: "sales", fn: () => fetchMonthSales(ticker, signal) },
    { key: "income", fn: () => fetchQuarterlyIncome(ticker, signal) },
    { key: "bs", fn: () => fetchQuarterlyBS(ticker, signal) },
    { key: "dividend", fn: () => fetchDividendPolicy(ticker, signal) },
    { key: "foreign", fn: () => fetchForeignTrading(ticker, signal) },
    { key: "trust", fn: () => fetchTrustTrading(ticker, signal) },
    { key: "broker", fn: () => fetchBrokerTrading(ticker, signal) },
    {
      key: "shareholders",
      fn: () => fetchShareholderStructure(ticker, signal),
    },
    // Tier 1 + Tier 2 新增資料源
    { key: "cashflow", fn: () => fetchQuarterlyCashflow(ticker, signal) },
    { key: "stats", fn: () => fetchDailyStatistics(ticker, signal) },
    { key: "insider", fn: () => fetchInsiderStructure(ticker, signal) },
    { key: "annualIs", fn: () => fetchAnnualIncome(ticker, signal) },
    { key: "annualBs", fn: () => fetchAnnualBS(ticker, signal) },
  ];

  // 首次查詢含策略分數 snapshot（全域 snapshot、非 per-ticker）
  if (!strategySnapshotLoadedOnce) {
    tasks.push({ key: "strategySnapshot", fn: () => fetchStrategySnapshot(signal) });
  }

  const results = await Promise.allSettled(tasks.map((t) => t.fn()));
  const data = {};
  results.forEach((r, i) => {
    data[tasks[i].key] = r.status === "fulfilled" ? r.value : null;
  });

  if (signal.aborted) return;

  // 首次將策略分數 snapshot 放入快取
  if (!strategySnapshotLoadedOnce) {
    strategySnapshotData = data.strategySnapshot; // null 或整包 JSON
    strategySnapshotLoadedOnce = true;
  }

  // 季→年股利聚合（供 dividend / cashflow / financial_ratios / long_term_trend 共用）
  const annualDiv = aggregateDividendsToAnnual(data.dividend?.data);

  // Section 1: Profile + valuation cards
  try {
    if (data.profile)
      renderProfile(
        data.profile.data,
        data.quotes?.data,
        data.bs?.data,
        data.income?.data,
      );
    else
      showError(document.getElementById("profile-content"), "公司資料載入失敗");
  } catch {
    showError(document.getElementById("profile-content"), "公司資料渲染錯誤");
  }

  // Section 1.5: 即時規則警示（只讀 Live API，不依賴策略分數 snapshot）
  try {
    const ruleResult = computeRuleAlerts({
      monthsales: data.sales?.data,
      incomeQ: data.income?.data,
      quotes: data.quotes?.data,
      stats: data.stats?.data,
    });
    renderRuleAlerts(ruleResult);
  } catch {
    showError(
      document.getElementById("rule-alerts-container"),
      "規則警示渲染錯誤",
    );
  }

  // Section 2a: Valuation trend table
  try {
    if (data.income) renderValuation(data.income.data, data.bs?.data);
    else
      showError(
        document.getElementById("valuation-table-container"),
        "估值趨勢資料載入失敗",
      );
  } catch {
    showError(
      document.getElementById("valuation-table-container"),
      "估值趨勢渲染錯誤",
    );
  }

  // Section 2b: Dividend history（年度視圖，修正既有 bug）
  try {
    if (annualDiv.length > 0) {
      renderDividend({
        annualDiv,
        quotes: data.quotes?.data,
        annualIs: data.annualIs?.data,
      });
    } else {
      showError(
        document.getElementById("dividend-table-container"),
        "股利資料載入失敗",
      );
    }
  } catch {
    showError(
      document.getElementById("dividend-table-container"),
      "股利渲染錯誤",
    );
  }

  // Section 3a: Revenue
  try {
    if (data.sales) renderRevenue(data.sales.data);
    else
      showError(
        document.getElementById("revenue-table-container"),
        "營收資料載入失敗",
      );
  } catch {
    showError(
      document.getElementById("revenue-table-container"),
      "營收渲染錯誤",
    );
  }

  // Section 3b: Income
  try {
    if (data.income) renderIncome(data.income.data);
    else
      showError(
        document.getElementById("income-table-container"),
        "損益資料載入失敗",
      );
  } catch {
    showError(
      document.getElementById("income-table-container"),
      "損益渲染錯誤",
    );
  }

  // Section 4a: Institutional
  try {
    if (data.foreign || data.trust || data.broker) {
      renderInstitutional(
        data.foreign?.data,
        data.trust?.data,
        data.broker?.data,
      );
    } else {
      showError(
        document.getElementById("institutional-table-container"),
        "法人資料載入失敗",
      );
    }
  } catch {
    showError(
      document.getElementById("institutional-table-container"),
      "法人渲染錯誤",
    );
  }

  // Section 4b: Shareholders
  try {
    if (data.shareholders) renderShareholders(data.shareholders.data);
    else
      showError(
        document.getElementById("shareholders-table-container"),
        "股權資料載入失敗",
      );
  } catch {
    showError(
      document.getElementById("shareholders-table-container"),
      "股權渲染錯誤",
    );
  }

  // Section 5: K-line (rendered but collapsed)
  try {
    if (data.quotes) renderKline(data.quotes.data);
    else showError(document.getElementById("kline-chart"), "K 線資料載入失敗");
  } catch (e) {
    showError(
      document.getElementById("kline-chart"),
      "K 線渲染錯誤: " + e.message,
    );
  }

  // Section 5.5 (NEW): 策略買入分數表（K 線之後、估值之前）
  try {
    renderStrategyScores(strategySnapshotData, ticker);
  } catch {
    showError(
      document.getElementById("strategy-scores-container"),
      "策略分數渲染錯誤",
    );
  }

  // Section 6: Strategy performance
  try {
    renderStrategy(ticker);
  } catch {
    showError(
      document.getElementById("strategy-holding-container"),
      "策略資料渲染錯誤",
    );
  }

  // === Tier 1 + Tier 2 新增區塊 ===

  // 財務比率儀表板（衍生，不打新 API）
  try {
    renderFinancialRatios({
      incomeQ: data.income?.data,
      bsQ: data.bs?.data,
      cfQ: data.cashflow?.data,
    });
  } catch {
    showError(
      document.getElementById("ratios-dashboard-container"),
      "財務比率渲染錯誤",
    );
  }

  // 現金流摘要
  try {
    if (data.cashflow) renderCashflow(data.cashflow.data, annualDiv);
    else
      showError(
        document.getElementById("cashflow-table-container"),
        "現金流資料載入失敗",
      );
  } catch {
    showError(
      document.getElementById("cashflow-table-container"),
      "現金流渲染錯誤",
    );
  }

  // 5 年長期趨勢
  try {
    if (data.annualIs || data.annualBs)
      renderLongTermTrend(data.annualIs?.data, data.annualBs?.data, annualDiv);
    else
      showError(
        document.getElementById("longterm-trend-container"),
        "年度財報載入失敗",
      );
  } catch {
    showError(
      document.getElementById("longterm-trend-container"),
      "長期趨勢渲染錯誤",
    );
  }

  // 公司治理（內部人持股 + 設質）
  try {
    if (data.insider) renderInsiderGovernance(data.insider.data);
    else
      showError(
        document.getElementById("governance-table-container"),
        "公司治理資料載入失敗",
      );
  } catch {
    showError(
      document.getElementById("governance-table-container"),
      "公司治理渲染錯誤",
    );
  }

  // 風險與技術面
  try {
    if (data.stats) renderRiskTechnical(data.stats.data);
    else
      showError(
        document.getElementById("risk-tech-container"),
        "技術指標載入失敗",
      );
  } catch {
    showError(
      document.getElementById("risk-tech-container"),
      "技術指標渲染錯誤",
    );
  }
}

// K-line collapse toggle
const klineToggle = document.getElementById("kline-toggle");
const klineCollapse = document.getElementById("kline-collapse");
const klineIcon = document.getElementById("kline-toggle-icon");

if (klineToggle) {
  klineToggle.addEventListener("click", () => {
    const isHidden = klineCollapse.classList.toggle("hidden");
    klineIcon.textContent = isHidden ? "▶ 展開" : "▼ 收合";
    // Trigger chart resize when expanding
    if (!isHidden) {
      window.dispatchEvent(new Event("resize"));
    }
  });
}

// Debounce
let debounceTimer;
function debouncedSearch() {
  const ticker = tickerInput.value.trim();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => search(ticker), 300);
}

searchBtn.addEventListener("click", debouncedSearch);
tickerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") debouncedSearch();
});

// Pre-load strategy CSV data
loadStrategyData();
