import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { renderProfile } from "../js/modules/profile.js";
import { renderStrategyScores } from "../js/modules/strategy_scores.js";

function withMockDocument(elements, fn) {
  const originalDocument = global.document;
  global.document = {
    getElementById(id) {
      return elements[id] ?? null;
    },
  };

  try {
    fn(elements);
  } finally {
    global.document = originalDocument;
  }
}

test("index.html keeps the CSP, search semantics, and live data timestamp hooks", () => {
  const html = readFileSync(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const css = readFileSync(
    new URL("../css/style.css", import.meta.url),
    "utf8",
  );
  const tailwindVendor = readFileSync(
    new URL("../vendor/tailwindcss-play-cdn.js", import.meta.url),
    "utf8",
  );
  const chartsVendor = readFileSync(
    new URL(
      "../vendor/lightweight-charts-4.standalone.production.js",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /id="ticker-search-form"[^>]*role="search"/);
  assert.match(html, /id="data-as-of"[^>]*aria-live="polite"/);
  assert.match(html, /src="vendor\/tailwindcss-play-cdn\.js"/);
  assert.match(
    html,
    /src="vendor\/lightweight-charts-4\.standalone\.production\.js"/,
  );
  assert.match(html, /id="print-export-btn"/);
  assert.match(html, /id="json-export-btn"/);
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
  assert.doesNotMatch(html, /unpkg\.com/);
  assert.doesNotMatch(css, /\.val-up::after/);
  assert.doesNotMatch(css, /\.val-down::after/);
  assert.match(tailwindVendor, /tailwindcss\.com should not be used in production/);
  assert.match(chartsVendor, /Lightweight Charts/);
});

test("index.html orders first-page sections before strategy scores", () => {
  const html = readFileSync(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  const profileStart = html.indexOf('id="section-profile"');
  const klineStart = html.indexOf('id="section-kline"');
  const summaryStart = html.indexOf('id="section-stock-summary"');
  const ruleAlertsStart = html.indexOf('id="section-rule-alerts"');
  const strategyStart = html.indexOf('id="section-strategy-scores"');
  const incomeStart = html.indexOf('id="section-income"');

  assert.ok(profileStart >= 0);
  assert.ok(ruleAlertsStart > profileStart);
  assert.ok(summaryStart > ruleAlertsStart);
  assert.ok(klineStart > summaryStart);
  assert.ok(strategyStart > klineStart);
  assert.equal(incomeStart, -1);
  assert.ok(
    html.indexOf('id="rule-alerts-container"', profileStart) > ruleAlertsStart,
  );
});

test("renderProfile escapes upstream text before writing to innerHTML", () => {
  withMockDocument({ "profile-content": { innerHTML: "" } }, (elements) => {
    renderProfile(
      [
        {
          股票代號: "2330",
          股票名稱: '<img src=x onerror="alert(1)">',
          公司名稱: "<script>alert('x')</script>",
          產業名稱: "半導體 & <b>測試</b>",
          董事長: 'A "B"',
          上市日期: "1994-09-05",
          實收資本額: 259325,
        },
      ],
      [
        {
          日期: "2026-04-16",
          收盤價: 2085,
          漲跌: 5,
          漲幅: 0.24,
        },
      ],
      [{ 每股淨值: 208.99 }],
      [
        { 年季: "202504", 每股稅後盈餘: 19.5 },
        { 年季: "202503", 每股稅後盈餘: 13.94 },
        { 年季: "202502", 每股稅後盈餘: 9.56 },
        { 年季: "202501", 每股稅後盈餘: 8.7 },
      ],
    );

    const { innerHTML } = elements["profile-content"];
    assert.doesNotMatch(innerHTML, /<script>alert\('x'\)<\/script>/);
    assert.doesNotMatch(innerHTML, /<img src=x onerror=/);
    assert.match(innerHTML, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
    assert.match(innerHTML, /半導體 &amp; &lt;b&gt;測試&lt;\/b&gt;/);
  });
});

test("renderStrategyScores escapes snapshot text in tooltips and headers, drops latest_date from DOM", () => {
  withMockDocument(
    { "strategy-scores-container": { innerHTML: "", onclick: null } },
    (elements) => {
      renderStrategyScores(
        {
          as_of: "<b>2026-04-16</b>",
          strategies: [
            {
              name: "F14_GMCTS",
              latest_date: "<script>oops()</script>",
              is_stale: false,
            },
            {
              name: '<svg onload="alert(1)">',
              latest_date: "2026-04-16",
              is_stale: false,
            },
          ],
          tickers: {
            "2330": {
              strategy_scores: {
                F14_GMCTS: 0.42,
                '<svg onload="alert(1)">': 0.91,
              },
            },
          },
        },
        "2330",
      );

      const { innerHTML } = elements["strategy-scores-container"];
      assert.doesNotMatch(innerHTML, /<svg onload=/);
      assert.doesNotMatch(innerHTML, /<script>oops\(\)<\/script>/);
      assert.doesNotMatch(innerHTML, /<b>2026-04-16<\/b>/);
      assert.match(innerHTML, /&lt;svg onload=&quot;alert\(1\)&quot;&gt;/);
      assert.doesNotMatch(innerHTML, /&lt;script&gt;oops\(\)&lt;\/script&gt;/);
      assert.match(innerHTML, /&lt;b&gt;2026-04-16&lt;\/b&gt;/);
      assert.match(innerHTML, /aria-sort="descending"/);
    },
  );
});

test("renderStrategyScores shows NotApplicable when scoresMap is empty", () => {
  withMockDocument(
    { "strategy-scores-container": { innerHTML: "", onclick: null } },
    (elements) => {
      renderStrategyScores(
        {
          as_of: "2026-04-16",
          strategies: [
            { name: "F14_A", latest_date: "2026-04-16", is_stale: false },
          ],
          tickers: { "2330": { strategy_scores: {} } },
        },
        "2330",
      );

      const { innerHTML } = elements["strategy-scores-container"];
      assert.doesNotMatch(innerHTML, /strategy-category-row/);
      assert.doesNotMatch(innerHTML, /<thead>/);
      assert.match(innerHTML, /未被任何策略評分|此股無分數/);
    },
  );
});

test("renderStrategyScores renders aggregate table when scoresMap is non-empty", () => {
  withMockDocument(
    { "strategy-scores-container": { innerHTML: "", onclick: null } },
    (elements) => {
      renderStrategyScores(
        {
          as_of: "2026-04-16",
          strategies: [
            { name: "F14_A", latest_date: "2026-04-16", is_stale: false },
            { name: "F28_X", latest_date: "2026-04-16", is_stale: false },
            { name: "Trading_EE1", latest_date: "2026-04-16", is_stale: false },
          ],
          tickers: { "2330": { strategy_scores: { F14_A: 0.5, Trading_EE1: 0 } } },
        },
        "2330",
      );

      const { innerHTML } = elements["strategy-scores-container"];
      assert.match(innerHTML, /strategy-category-row/);
      assert.match(innerHTML, /策略類別/);
      assert.match(innerHTML, /平均分/);
      assert.match(innerHTML, /最高分/);
      assert.match(innerHTML, /最低分/);
      assert.match(innerHTML, /覆蓋比例/);
      assert.match(innerHTML, /F28/);
      assert.match(innerHTML, /Trading_EE1/);
      assert.doesNotMatch(innerHTML, />其他</);
      assert.match(innerHTML, /—/);
    },
  );
});

test("table cell direction classes keep higher color specificity than base td styles", () => {
  const css = readFileSync(
    new URL("../css/style.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.data-table td\.val-up\b/);
  assert.match(css, /\.data-table td\.val-down\b/);
  assert.match(css, /\.data-table td\.val-neutral\b/);
});
