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

function parseMetricCards(html) {
  return [
    ...html.matchAll(
      /<div class="metric-card">\s*<div class="metric-label">([^<]+)<\/div>\s*<div class="metric-value">([^<]+)<\/div>/g,
    ),
  ].map((match) => ({
    label: match[1].trim(),
    value: match[2].trim(),
  }));
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
  assert.match(html, /for="ticker-input"[^>]*>股票代號或名稱</);
  assert.match(html, /placeholder="輸入股票代號或名稱[^"]*"/);
  assert.match(html, /id="search-hint"[^>]*aria-live="polite"/);
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

test("index.html discloses that alert score overlay is not point-in-time", () => {
  const html = readFileSync(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(html, /警示分數為/);
  assert.match(html, /高分代表警示較多/);
  assert.match(html, /非歷史可投資訊號/);
  assert.match(html, /季財報公告日延遲未列入計算/);
});

test("data-table text-center utility overrides default numeric alignment", () => {
  const css = readFileSync(
    new URL("../css/style.css", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /\.data-table th\.text-center,\s*\.data-table td\.text-center\s*\{\s*text-align: center;/,
  );
});

test("governance table keeps holder columns equal-width with symmetric padding", () => {
  const css = readFileSync(
    new URL("../css/style.css", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /#governance-table-container \.data-table\s*\{\s*table-layout: fixed;/,
  );
  assert.match(
    css,
    /#governance-table-container \.data-table thead tr:first-child th:first-child\s*\{\s*width: 8%;/,
  );
  assert.match(
    css,
    /#governance-table-container \.data-table th,\s*#governance-table-container \.data-table td:not\(:first-child\)\s*\{\s*text-align: center;/,
  );
  assert.match(
    css,
    /#governance-table-container \.data-table thead tr:first-child th:first-child,\s*#governance-table-container \.data-table tbody td:first-child\s*\{\s*text-align: left;/,
  );
  assert.match(
    css,
    /\.governance-table \.gov-col-pct,\s*\.governance-table \.gov-col-delta,\s*\.governance-table \.gov-col-pledge\s*\{\s*width: 10\.2222%;\s*\}/,
  );
  assert.doesNotMatch(css, /\.governance-table \.gov-group-header/);
  assert.doesNotMatch(css, /\.governance-table \.gov-group-label/);

  const groupStartRule = css.match(
    /\.governance-table th\.group-start,\s*\.governance-table td\.group-start\s*\{[^}]+\}/,
  )?.[0];
  assert.ok(groupStartRule);
  assert.doesNotMatch(groupStartRule, /padding-left/);
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

test("renderProfile maps PE cards to PE4 and estimated PE fields", () => {
  withMockDocument({ "profile-content": { innerHTML: "" } }, (elements) => {
    renderProfile(
      [{ 股票代號: "2330", 股票名稱: "台積電" }],
      [{ 日期: "2026-03-31", 本益比: 5, 本益比4: 21.5 }],
      [],
      [],
    );

    const cards = parseMetricCards(elements["profile-content"].innerHTML);
    assert.equal(cards.find((card) => card.label === "PE")?.value, "21.5");
    assert.equal(
      cards.find((card) => card.label === "PE(預估)")?.value,
      "5.0",
    );
    assert.equal(cards.find((card) => card.label.includes("PE₄")), undefined);
  });
});

test("renderProfile renders missing or zero PE fields as dashes independently", () => {
  const cases = [
    {
      quote: { 本益比: null, 本益比4: 18 },
      expectedPe: "18.0",
      expectedEstimate: "—",
    },
    {
      quote: { 本益比: 12, 本益比4: null },
      expectedPe: "—",
      expectedEstimate: "12.0",
    },
    {
      quote: { 本益比: 0, 本益比4: 0 },
      expectedPe: "—",
      expectedEstimate: "—",
    },
  ];

  for (const { quote, expectedPe, expectedEstimate } of cases) {
    withMockDocument({ "profile-content": { innerHTML: "" } }, (elements) => {
      renderProfile(
        [{ 股票代號: "2330", 股票名稱: "台積電" }],
        [{ 日期: "2026-03-31", ...quote }],
        [],
        [],
      );

      const cards = parseMetricCards(elements["profile-content"].innerHTML);
      assert.equal(cards.find((card) => card.label === "PE")?.value, expectedPe);
      assert.equal(
        cards.find((card) => card.label === "PE(預估)")?.value,
        expectedEstimate,
      );
    });
  }
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
