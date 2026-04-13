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
import { showError } from "./utils.js";

let abortController = null;

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
  ];

  const results = await Promise.allSettled(tasks.map((t) => t.fn()));
  const data = {};
  results.forEach((r, i) => {
    data[tasks[i].key] = r.status === "fulfilled" ? r.value : null;
  });

  if (signal.aborted) return;

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
      );
  } catch {
    showError(
      document.getElementById("profile-content"),
      "公司資料渲染錯誤",
    );
  }

  // Section 2a: Valuation trend table
  try {
    if (data.income)
      renderValuation(data.income.data, data.bs?.data);
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

  // Section 2b: Dividend history
  try {
    if (data.dividend) renderDividend(data.dividend.data);
    else
      showError(
        document.getElementById("dividend-table-container"),
        "股利資料載入失敗",
      );
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

  // Section 6: Strategy performance
  try {
    renderStrategy(ticker);
  } catch {
    showError(
      document.getElementById("strategy-holding-container"),
      "策略資料渲染錯誤",
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
