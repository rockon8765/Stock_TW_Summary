import { test } from "node:test";
import assert from "node:assert/strict";
import { createSearchController } from "../js/lib/search_controller.js";

function createTimerHarness() {
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeoutFn(fn, delay) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeoutFn(id) {
      timers.delete(id);
    },
    fireAll() {
      const entries = [...timers.values()];
      timers.clear();
      return Promise.all(entries.map(({ fn }) => fn()));
    },
    fireOne() {
      const entry = timers.entries().next().value;
      if (!entry) return Promise.resolve();
      const [id, { fn }] = entry;
      timers.delete(id);
      return fn();
    },
    get size() {
      return timers.size;
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("createSearchController coalesces consecutive submits", async () => {
  const timers = createTimerHarness();
  const resolved = [];
  const controller = createSearchController({
    resolver: async (text) => text,
    onResolved: (ticker) => resolved.push(ticker),
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  controller.submit("2");
  controller.submit("23");
  controller.submit("233");
  controller.submit("2330");
  await timers.fireAll();

  assert.deepEqual(resolved, ["2330"]);
});

test("createSearchController discards a stale in-flight resolver", async () => {
  const timers = createTimerHarness();
  const pending = new Map();
  const resolved = [];
  const controller = createSearchController({
    resolver: (text) => {
      const task = deferred();
      pending.set(text, task);
      return task.promise;
    },
    onResolved: (ticker) => resolved.push(ticker),
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  controller.submit("2330");
  const first = timers.fireOne();
  controller.submit("台積電");
  const second = timers.fireOne();

  pending.get("2330").resolve("2330");
  pending.get("台積電").resolve("2330");
  await Promise.all([first, second]);

  assert.deepEqual(resolved, ["2330"]);
});

test("createSearchController clears old work for empty input", async () => {
  const timers = createTimerHarness();
  const resolved = [];
  const hints = [];
  const controller = createSearchController({
    resolver: async (text) => text,
    onResolved: (ticker) => resolved.push(ticker),
    onHint: (message) => hints.push(message),
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  controller.submit("2330");
  controller.submit("");
  await timers.fireAll();

  assert.deepEqual(resolved, []);
  assert.deepEqual(hints, [null]);
});

test("createSearchController turns resolver errors into a search hint", async () => {
  const timers = createTimerHarness();
  const hints = [];
  const controller = createSearchController({
    resolver: async () => {
      throw new Error("csv failed");
    },
    onHint: (message) => hints.push(message),
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  controller.submit("台積電");
  await timers.fireAll();

  assert.equal(hints.length, 1);
  assert.match(hints[0], /找不到「台積電」對應的股票/);
});

test("createSearchController cancels in-flight resolver work", async () => {
  const timers = createTimerHarness();
  const task = deferred();
  const resolved = [];
  const controller = createSearchController({
    resolver: async () => task.promise,
    onResolved: (ticker) => resolved.push(ticker),
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  controller.submit("2330");
  const running = timers.fireOne();
  controller.cancel();
  task.resolve("2330");
  await running;

  assert.deepEqual(resolved, []);
});

test("createSearchController rewrites the input before invoking search", async () => {
  const timers = createTimerHarness();
  const events = [];
  const controller = createSearchController({
    resolver: async () => "2330",
    onResolvedRewrite: (ticker) => events.push(`rewrite:${ticker}`),
    onResolved: (ticker) => events.push(`search:${ticker}`),
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  controller.submit("台積電");
  await timers.fireAll();

  assert.deepEqual(events, ["rewrite:2330", "search:2330"]);
});
