import { test } from "node:test";
import assert from "node:assert/strict";
import { createRetryableSnapshotLoader } from "../js/lib/strategy_snapshot_loader.js";

test("snapshot loader retries after a null result", async () => {
  let calls = 0;
  const loader = createRetryableSnapshotLoader(async () => {
    calls += 1;
    return calls === 1 ? null : { tickers: { "2330": {} } };
  });

  assert.equal(await loader.load(), null);
  assert.deepEqual(await loader.load(), { tickers: { "2330": {} } });
  assert.equal(calls, 2);
});

test("snapshot loader shares in-flight work and caches the first successful payload", async () => {
  let calls = 0;
  let resolveFetch;
  const loader = createRetryableSnapshotLoader(
    () =>
      new Promise((resolve) => {
        calls += 1;
        resolveFetch = () => resolve({ tickers: { "2330": { score: 1 } } });
      }),
  );

  const first = loader.load();
  const second = loader.load();
  resolveFetch();

  const [firstResult, secondResult] = await Promise.all([first, second]);
  const thirdResult = await loader.load();

  assert.deepEqual(firstResult, { tickers: { "2330": { score: 1 } } });
  assert.deepEqual(secondResult, firstResult);
  assert.deepEqual(thirdResult, firstResult);
  assert.equal(calls, 1);
});

test("snapshot loader does not reuse an aborted in-flight load for a new signal", async () => {
  let calls = 0;
  const resolvers = [];
  const loader = createRetryableSnapshotLoader(
    (signal) =>
      new Promise((resolve, reject) => {
        calls += 1;
        resolvers.push(resolve);
        signal.addEventListener(
          "abort",
          () => {
            queueMicrotask(() => {
              const error = new Error("Aborted");
              error.name = "AbortError";
              reject(error);
            });
          },
          { once: true },
        );
      }),
  );

  const firstController = new AbortController();
  const secondController = new AbortController();

  const first = loader.load(firstController.signal);
  firstController.abort();

  const second = loader.load(secondController.signal);
  await Promise.resolve();
  resolvers[1]?.({ tickers: { "2330": { score: 1 } } });

  await assert.rejects(first, { name: "AbortError" });
  assert.deepEqual(await second, { tickers: { "2330": { score: 1 } } });
  assert.equal(calls, 2);
});
