import {
  fetchDailyQuotes,
  fetchCompanyProfile,
  fetchMonthSales,
  fetchQuarterlyIncome,
  fetchForeignTrading,
  fetchTrustTrading,
  fetchBrokerTrading,
  fetchShareholderStructure,
} from "./api.js";
import { renderProfile } from "./modules/profile.js";
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
  // Restore skeleton loading for all sections
  const skeletons = {
    "profile-content":
      '<div class="skeleton h-6 w-48 mb-3"></div><div class="skeleton h-4 w-96"></div>',
    "kline-chart":
      '<div class="section-loading h-full flex items-center justify-center"><div class="skeleton h-full w-full rounded-lg"></div></div>',
    "revenue-chart-container":
      '<div class="section-loading h-full"><div class="skeleton h-full w-full rounded-lg"></div></div>',
    "revenue-table-container":
      '<div class="section-loading"><div class="skeleton h-40 w-full rounded-lg"></div></div>',
    "income-table-container":
      '<div class="section-loading"><div class="skeleton h-64 w-full rounded-lg"></div></div>',
    "institutional-chart-container":
      '<div class="section-loading h-full"><div class="skeleton h-full w-full rounded-lg"></div></div>',
    "institutional-cards":
      '<div class="section-loading"><div class="skeleton h-28 w-full rounded-lg"></div></div><div class="section-loading"><div class="skeleton h-28 w-full rounded-lg"></div></div><div class="section-loading"><div class="skeleton h-28 w-full rounded-lg"></div></div>',
    "shareholders-chart-container":
      '<div class="section-loading h-full"><div class="skeleton h-full w-full rounded-lg"></div></div>',
    "shareholders-trend-container":
      '<div class="section-loading h-full"><div class="skeleton h-full w-full rounded-lg"></div></div>',
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

  // Cancel previous request
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

  // Render each module independently
  try {
    if (data.profile) renderProfile(data.profile.data, data.quotes?.data);
    else
      showError(document.getElementById("profile-content"), "公司資料載入失敗");
  } catch {
    showError(document.getElementById("profile-content"), "公司資料渲染錯誤");
  }

  try {
    if (data.quotes) renderKline(data.quotes.data);
    else showError(document.getElementById("kline-chart"), "K 線資料載入失敗");
  } catch (e) {
    console.error("K線渲染錯誤:", e);
    showError(
      document.getElementById("kline-chart"),
      "K 線渲染錯誤: " + e.message,
    );
  }

  try {
    if (data.sales) renderRevenue(data.sales.data);
    else
      showError(
        document.getElementById("revenue-chart-container"),
        "營收資料載入失敗",
      );
  } catch {
    showError(
      document.getElementById("revenue-chart-container"),
      "營收渲染錯誤",
    );
  }

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

  try {
    if (data.foreign || data.trust || data.broker) {
      renderInstitutional(
        data.foreign?.data,
        data.trust?.data,
        data.broker?.data,
      );
    } else {
      showError(
        document.getElementById("institutional-chart-container"),
        "法人資料載入失敗",
      );
    }
  } catch {
    showError(
      document.getElementById("institutional-chart-container"),
      "法人渲染錯誤",
    );
  }

  try {
    if (data.shareholders) renderShareholders(data.shareholders.data);
    else
      showError(
        document.getElementById("shareholders-chart-container"),
        "股權資料載入失敗",
      );
  } catch {
    showError(
      document.getElementById("shareholders-chart-container"),
      "股權渲染錯誤",
    );
  }

  // Strategy performance (from local CSV)
  try {
    renderStrategy(ticker);
  } catch {
    showError(
      document.getElementById("strategy-holding-container"),
      "策略資料渲染錯誤",
    );
  }
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
