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
import { renderKline, setRuleScoreOverlay } from "./charts/kline.js";
import { renderRevenue } from "./modules/revenue.js";
import { renderInstitutional } from "./modules/institutional.js";
import { renderShareholders } from "./modules/shareholders.js";
import {
  ensureStrategyDataLoaded,
  loadStrategyData,
  renderStrategy,
} from "./modules/strategy.js";
import { renderCashflow } from "./modules/cashflow.js";
import { renderFinancialRatios } from "./modules/financial_ratios.js";
import { renderRiskTechnical } from "./modules/risk_technical.js";
import { renderInsiderGovernance } from "./modules/insider_governance.js";
import { renderLongTermTrend } from "./modules/long_term_trend.js";
import { renderRuleAlerts } from "./modules/rule_alerts.js";
import { renderStrategyScores } from "./modules/strategy_scores.js";
import { renderStockSummary } from "./modules/stock_summary.js";
import {
  computeBuyScore,
  computePeriodScores,
  computeRuleAlerts,
} from "./lib/rule_engine.js";
import { aggregateDividendsToAnnual } from "./lib/dividend_aggregator.js";
import {
  buildLoadingMarkup,
  latestRowByKey,
  resolveRetryTicker,
  showError,
} from "./utils.js";
import { createRetryableSnapshotLoader } from "./lib/strategy_snapshot_loader.js";

let abortController = null;
const strategySnapshotLoader = createRetryableSnapshotLoader(
  fetchStrategySnapshot,
);

const tickerInput = document.getElementById("ticker-input");
const searchForm = document.getElementById("ticker-search-form");
const searchBtn = document.getElementById("search-btn");
const printExportBtn = document.getElementById("print-export-btn");
const jsonExportBtn = document.getElementById("json-export-btn");
const welcomeMsg = document.getElementById("welcome-msg");
const dataContainer = document.getElementById("data-container");
const dataAsOf = document.getElementById("data-as-of");
const busySectionIds = [
  "profile-content",
  "valuation-table-container",
  "dividend-table-container",
  "revenue-table-container",
  "institutional-table-container",
  "institutional-cards",
  "shareholders-table-container",
  "kline-chart",
  "strategy-holding-container",
  "strategy-trade-container",
  "ratios-dashboard-container",
  "cashflow-table-container",
  "longterm-trend-container",
  "governance-table-container",
  "risk-tech-container",
  "stock-summary-content",
  "rule-alerts-container",
  "strategy-scores-container",
];
let latestExportPayload = null;

function latestValueByDate(rows, dateField, valueField = dateField) {
  const latest = latestRowByKey(rows, dateField);
  return latest?.[valueField] ? String(latest[valueField]) : "";
}

function setExportButtonsEnabled(isEnabled) {
  [printExportBtn, jsonExportBtn].forEach((button) => {
    if (!button) return;
    button.disabled = !isEnabled;
    button.setAttribute("aria-disabled", String(!isEnabled));
  });
}

function updateExportPayload(ticker, data) {
  latestExportPayload = {
    exported_at: new Date().toISOString(),
    ticker,
    datasets: Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, value?.data ?? value]),
    ),
  };
  setExportButtonsEnabled(true);
}

function exportCurrentSnapshot() {
  if (!latestExportPayload) return;

  const exportedDate = latestExportPayload.exported_at.slice(0, 10);
  const filename = `${latestExportPayload.ticker || "stock"}-snapshot-${exportedDate}.json`;
  const blob = new Blob([JSON.stringify(latestExportPayload, null, 2)], {
    type: "application/json",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function setDataTimestamp(parts = []) {
  if (!dataAsOf) return;
  dataAsOf.textContent =
    parts.length > 0 ? `資料時間：${parts.join(" ｜ ")}` : "資料時間：—";
}

function updateDataTimestamp({ quotes, sales, income }) {
  const quoteDate = latestValueByDate(quotes, "日期");
  const salesAnnouncement = latestValueByDate(sales, "公告日");
  const incomeAnnouncement =
    latestValueByDate(income, "公告日期") ||
    latestValueByDate(income, "公告日");

  const parts = [];
  if (quoteDate) parts.push(`報價 ${quoteDate}`);
  if (salesAnnouncement) parts.push(`月營收公告 ${salesAnnouncement}`);
  if (incomeAnnouncement) parts.push(`季報公告 ${incomeAnnouncement}`);

  setDataTimestamp(parts);
}

function setSectionsBusyState(isBusy) {
  for (const id of busySectionIds) {
    const el = document.getElementById(id);
    if (el) el.setAttribute("aria-busy", String(isBusy));
  }
}

function resetSections() {
  const skeletons = {
    "profile-content": buildLoadingMarkup("公司概要", {
      contentHtml:
        '<div class="skeleton h-6 w-48 mb-3"></div><div class="skeleton h-4 w-96"></div>',
    }),
    "valuation-table-container": buildLoadingMarkup("季度財務", {
      skeletonClass: "h-64 w-full rounded-lg",
    }),
    "dividend-table-container": buildLoadingMarkup("股利發放歷史", {
      skeletonClass: "h-64 w-full rounded-lg",
    }),
    "revenue-table-container": buildLoadingMarkup("月營收", {
      skeletonClass: "h-40 w-full rounded-lg",
    }),
    "institutional-table-container": buildLoadingMarkup("三大法人買賣超", {
      skeletonClass: "h-64 w-full rounded-lg",
    }),
    "institutional-cards": Array.from({ length: 3 }, () =>
      buildLoadingMarkup("法人摘要卡片", {
        skeletonClass: "h-24 w-full rounded-lg",
      }),
    ).join(""),
    "shareholders-table-container": buildLoadingMarkup("股權分散表", {
      skeletonClass: "h-64 w-full rounded-lg",
    }),
    "kline-chart": buildLoadingMarkup("K 線圖", {
      containerClass: "h-full flex items-center justify-center",
      skeletonClass: "h-full w-full rounded-lg",
    }),
    "strategy-holding-container": buildLoadingMarkup("策略持有績效", {
      skeletonClass: "h-48 w-full rounded-lg",
    }),
    "strategy-trade-container": buildLoadingMarkup("策略歷史交易績效", {
      skeletonClass: "h-48 w-full rounded-lg",
    }),
    "ratios-dashboard-container": Array.from({ length: 6 }, () =>
      buildLoadingMarkup("財務比率儀表板", {
        skeletonClass: "h-20 w-full rounded-lg",
      }),
    ).join(""),
    "cashflow-table-container": buildLoadingMarkup("現金流摘要", {
      skeletonClass: "h-64 w-full rounded-lg",
    }),
    "longterm-trend-container": buildLoadingMarkup("5 年長期趨勢", {
      skeletonClass: "h-64 w-full rounded-lg",
    }),
    "governance-table-container": buildLoadingMarkup("公司治理", {
      skeletonClass: "h-64 w-full rounded-lg",
    }),
    "risk-tech-container": buildLoadingMarkup("風險與技術面", {
      skeletonClass: "h-48 w-full rounded-lg",
    }),
    "stock-summary-content": buildLoadingMarkup("股票摘要", {
      skeletonClass: "h-16 w-full rounded-lg",
    }),
    "rule-alerts-container": buildLoadingMarkup("即時規則警示", {
      skeletonClass: "h-12 w-full rounded-lg",
    }),
    "strategy-scores-container": buildLoadingMarkup("策略買入分數", {
      skeletonClass: "h-48 w-full rounded-lg",
    }),
  };
  for (const [id, html] of Object.entries(skeletons)) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
  setSectionsBusyState(true);
}

async function search(ticker) {
  if (!ticker) return;

  if (abortController) abortController.abort();
  abortController = new AbortController();
  const { signal } = abortController;

  welcomeMsg.classList.add("hidden");
  dataContainer.classList.remove("hidden");
  resetSections();
  setDataTimestamp(["載入中"]);
  latestExportPayload = null;
  setExportButtonsEnabled(false);

  const strategyDataPromise = ensureStrategyDataLoaded();
  const strategySnapshotPromise = strategySnapshotLoader.load(signal);
  const retryOptions = (section) => ({
    retrySection: section,
    retryTicker: ticker,
  });

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

  const results = await Promise.allSettled(tasks.map((t) => t.fn()));
  const data = {};
  results.forEach((r, i) => {
    data[tasks[i].key] = r.status === "fulfilled" ? r.value : null;
  });

  let strategySnapshotData;
  try {
    [, strategySnapshotData] = await Promise.all([
      strategyDataPromise,
      strategySnapshotPromise,
    ]);
  } catch (error) {
    if (error?.name === "AbortError") return;
    throw error;
  }

  if (signal.aborted) return;

  updateDataTimestamp({
    quotes: data.quotes?.data,
    sales: data.sales?.data,
    income: data.income?.data,
  });
  updateExportPayload(ticker, {
    ...data,
    strategySnapshot:
      strategySnapshotLoader.getCached() ?? strategySnapshotData,
  });

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
      showError(
        document.getElementById("profile-content"),
        "公司資料載入失敗",
        retryOptions("profile"),
      );
  } catch {
    showError(
      document.getElementById("profile-content"),
      "公司資料渲染錯誤",
      retryOptions("profile"),
    );
  }

  let ruleResult = null;
  let ruleScore = computeBuyScore(0, 0);

  // Section 1.7: 即時規則警示（只讀 Live API，不依賴策略分數 snapshot）
  try {
    ruleResult = computeRuleAlerts({
      monthsales: data.sales?.data,
      incomeQ: data.income?.data,
      quotes: data.quotes?.data,
      stats: data.stats?.data,
    });
    ruleScore = computeBuyScore(
      ruleResult.latestAvailableCount,
      ruleResult.latestAlertCount,
    );
    renderRuleAlerts(ruleResult);
    setRuleScoreOverlay(computePeriodScores(ruleResult));
  } catch {
    showError(
      document.getElementById("rule-alerts-container"),
      "規則警示渲染錯誤",
      retryOptions("rule-alerts"),
    );
  }

  // Section 2a: 季度財務（整併原「估值趨勢」與「季度損益」）
  try {
    if (data.income) renderValuation(data.income.data, data.bs?.data);
    else
      showError(
        document.getElementById("valuation-table-container"),
        "季度財務資料載入失敗",
        retryOptions("valuation"),
      );
  } catch {
    showError(
      document.getElementById("valuation-table-container"),
      "季度財務渲染錯誤",
      retryOptions("valuation"),
    );
  }

  // Section 2b: Dividend history（年度視圖，修正既有 bug）
  try {
    if (data.dividend) {
      renderDividend({
        annualDiv,
        quotes: data.quotes?.data,
        annualIs: data.annualIs?.data,
      });
    } else {
      showError(
        document.getElementById("dividend-table-container"),
        "股利資料載入失敗",
        retryOptions("dividend"),
      );
    }
  } catch {
    showError(
      document.getElementById("dividend-table-container"),
      "股利渲染錯誤",
      retryOptions("dividend"),
    );
  }

  // Section 3a: Revenue
  try {
    if (data.sales) renderRevenue(data.sales.data);
    else
      showError(
        document.getElementById("revenue-table-container"),
        "營收資料載入失敗",
        retryOptions("revenue"),
      );
  } catch {
    showError(
      document.getElementById("revenue-table-container"),
      "營收渲染錯誤",
      retryOptions("revenue"),
    );
  }

  // Section 3b: 季度損益已整併進「季度財務」區塊（renderValuation），不再獨立渲染。

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
        retryOptions("institutional"),
      );
    }
  } catch {
    showError(
      document.getElementById("institutional-table-container"),
      "法人渲染錯誤",
      retryOptions("institutional"),
    );
  }

  // Section 4b: Shareholders
  try {
    if (data.shareholders) renderShareholders(data.shareholders.data);
    else
      showError(
        document.getElementById("shareholders-table-container"),
        "股權資料載入失敗",
        retryOptions("shareholders"),
      );
  } catch {
    showError(
      document.getElementById("shareholders-table-container"),
      "股權渲染錯誤",
      retryOptions("shareholders"),
    );
  }

  // Section 5: K-line (rendered but collapsed)
  try {
    if (data.quotes) renderKline(data.quotes.data);
    else
      showError(document.getElementById("kline-chart"), "K 線資料載入失敗", {
        ...retryOptions("kline"),
      });
  } catch (e) {
    showError(
      document.getElementById("kline-chart"),
      "K 線渲染錯誤: " + e.message,
      retryOptions("kline"),
    );
  }

  // Section 5.5: 股票摘要（K 線之後、規則警示之前）
  try {
    renderStockSummary({
      profile: data.profile?.data,
      quotes: data.quotes?.data,
      sales: data.sales?.data,
      income: data.income?.data,
      dividend: annualDiv,
      ruleScore,
    });
  } catch {
    showError(
      document.getElementById("stock-summary-content"),
      "股票摘要渲染錯誤",
      retryOptions("stock-summary"),
    );
  }

  // Section 5.8 (NEW): 策略買入分數表（K 線之後、估值之前）
  try {
    renderStrategyScores(
      strategySnapshotLoader.getCached() ?? strategySnapshotData,
      ticker,
    );
  } catch {
    showError(
      document.getElementById("strategy-scores-container"),
      "策略分數渲染錯誤",
      retryOptions("strategy-scores"),
    );
  }

  // Section 6: Strategy performance
  try {
    renderStrategy(ticker);
  } catch {
    showError(
      document.getElementById("strategy-holding-container"),
      "策略資料渲染錯誤",
      retryOptions("strategy"),
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
      retryOptions("ratios"),
    );
  }

  // 現金流摘要
  try {
    if (data.cashflow) renderCashflow(data.cashflow.data, annualDiv);
    else
      showError(
        document.getElementById("cashflow-table-container"),
        "現金流資料載入失敗",
        retryOptions("cashflow"),
      );
  } catch {
    showError(
      document.getElementById("cashflow-table-container"),
      "現金流渲染錯誤",
      retryOptions("cashflow"),
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
        retryOptions("longterm"),
      );
  } catch {
    showError(
      document.getElementById("longterm-trend-container"),
      "長期趨勢渲染錯誤",
      retryOptions("longterm"),
    );
  }

  // 公司治理（內部人持股 + 設質）
  try {
    if (data.insider) renderInsiderGovernance(data.insider.data);
    else
      showError(
        document.getElementById("governance-table-container"),
        "公司治理資料載入失敗",
        retryOptions("governance"),
      );
  } catch {
    showError(
      document.getElementById("governance-table-container"),
      "公司治理渲染錯誤",
      retryOptions("governance"),
    );
  }

  // 風險與技術面
  try {
    if (data.stats) renderRiskTechnical(data.stats.data);
    else
      showError(
        document.getElementById("risk-tech-container"),
        "技術指標載入失敗",
        retryOptions("risk-tech"),
      );
  } catch {
    showError(
      document.getElementById("risk-tech-container"),
      "技術指標渲染錯誤",
      retryOptions("risk-tech"),
    );
  }

  setSectionsBusyState(false);
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

if (searchForm) {
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    debouncedSearch();
  });
} else if (searchBtn) {
  searchBtn.addEventListener("click", debouncedSearch);
}

dataContainer.addEventListener("click", (event) => {
  const retryButton = event.target.closest("button[data-retry-section]");
  if (!retryButton) return;

  const ticker = resolveRetryTicker(
    retryButton.dataset.retryTicker,
    tickerInput?.value,
  );
  if (!ticker) return;

  if (tickerInput) tickerInput.value = ticker;
  search(ticker);
});

if (printExportBtn) {
  printExportBtn.addEventListener("click", () => {
    if (!latestExportPayload) return;
    window.print();
  });
}

if (jsonExportBtn) {
  jsonExportBtn.addEventListener("click", exportCurrentSnapshot);
}

// Pre-load strategy CSV data
loadStrategyData();
setExportButtonsEnabled(false);
