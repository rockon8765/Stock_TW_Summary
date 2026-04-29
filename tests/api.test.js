import { test } from "node:test";
import assert from "node:assert/strict";
import { clearQueryCacheForTests, queryTable } from "../js/api.js";

function makeSuccessResponse(payload) {
  return {
    ok: true,
    async json() {
      return { status: "success", ...payload };
    },
  };
}

test("queryTable refetches after a successful response settles", async () => {
  clearQueryCacheForTests();

  let calls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    calls += 1;
    return makeSuccessResponse({ data: [{ ticker: "2330" }] });
  };

  try {
    await queryTable("md_cm_fi_monthsales", { ticker: "2330", page_size: 12 });
    await queryTable("md_cm_fi_monthsales", { page_size: 12, ticker: "2330" });
  } finally {
    global.fetch = originalFetch;
    clearQueryCacheForTests();
  }

  assert.equal(calls, 2);
});

test("queryTable does not cache failed responses", async () => {
  clearQueryCacheForTests();

  let calls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) return { ok: false, status: 500 };
    return makeSuccessResponse({ data: [] });
  };

  try {
    await assert.rejects(() =>
      queryTable("md_cm_fi_monthsales", { ticker: "2330", page_size: 12 }),
    );
    await queryTable("md_cm_fi_monthsales", { ticker: "2330", page_size: 12 });
  } finally {
    global.fetch = originalFetch;
    clearQueryCacheForTests();
  }

  assert.equal(calls, 2);
});

test("queryTable shares in-flight requests for the same table and params", async () => {
  clearQueryCacheForTests();

  let calls = 0;
  let resolveFetch;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      async json() {
        await new Promise((resolve) => {
          resolveFetch = resolve;
        });
        return { status: "success", data: [{ ticker: "2330" }] };
      },
    };
  };

  try {
    const first = queryTable("md_cm_fi_monthsales", {
      ticker: "2330",
      page_size: 12,
    });
    const second = queryTable("md_cm_fi_monthsales", {
      page_size: 12,
      ticker: "2330",
    });

    await Promise.resolve();
    assert.equal(typeof resolveFetch, "function");
    resolveFetch();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    assert.equal(calls, 1);
    assert.deepEqual(firstResult, secondResult);
  } finally {
    global.fetch = originalFetch;
    clearQueryCacheForTests();
  }
});
