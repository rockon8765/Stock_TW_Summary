import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateByCategory,
  categorize,
  sortRows,
} from "../js/modules/strategy_scores.js";

test("categorize uses F-prefix or 其他", () => {
  assert.equal(categorize("F14_GMCTS"), "F14");
  assert.equal(categorize("F14_MCTS10"), "F14");
  assert.equal(categorize("F28_MCTS5"), "F28");
  assert.equal(categorize("Trading_EE1"), "其他");
  assert.equal(categorize("RandomThing"), "其他");
  assert.equal(categorize(""), "其他");
});

test("aggregateByCategory computes mean/max/min/scoredCount/total correctly", () => {
  const meta = [
    { name: "F14_A", is_stale: false },
    { name: "F14_B", is_stale: false },
    { name: "F14_C", is_stale: false },
    { name: "F28_X", is_stale: true },
  ];
  const scores = { F14_A: 0.4, F14_B: 0.2, F14_C: 0.3, F28_X: 0.5 };

  const out = aggregateByCategory(meta, scores);
  const f14 = out.find((c) => c.category === "F14");

  assert.equal(f14.total, 3);
  assert.equal(f14.scoredCount, 3);
  assert.ok(Math.abs(f14.mean - 0.3) < 1e-9);
  assert.equal(f14.max, 0.4);
  assert.equal(f14.min, 0.2);
  assert.equal(f14.maxStrategy, "F14_A");
  assert.equal(f14.minStrategy, "F14_B");
  assert.equal(f14.allStale, false);
});

test("category with zero scored strategies returns null aggregates", () => {
  const meta = [{ name: "F14_A", is_stale: false }];
  const scores = {};

  const out = aggregateByCategory(meta, scores);
  const f14 = out.find((c) => c.category === "F14");

  assert.equal(f14.scoredCount, 0);
  assert.equal(f14.mean, null);
  assert.equal(f14.max, null);
  assert.equal(f14.min, null);
  assert.equal(f14.maxStrategy, null);
  assert.equal(f14.minStrategy, null);
});

test("category marked allStale when every strategy is_stale is true", () => {
  const meta = [
    { name: "F14_A", is_stale: true },
    { name: "F14_B", is_stale: true },
    { name: "F28_X", is_stale: true },
    { name: "F28_Y", is_stale: false },
  ];
  const scores = { F14_A: 0.1, F14_B: 0.2, F28_X: 0.3, F28_Y: 0.4 };

  const out = aggregateByCategory(meta, scores);

  assert.equal(out.find((c) => c.category === "F14").allStale, true);
  assert.equal(out.find((c) => c.category === "F28").allStale, false);
});

test("aggregateByCategory ignores non-finite scores", () => {
  const meta = [
    { name: "F14_A", is_stale: false },
    { name: "F14_B", is_stale: false },
    { name: "F14_C", is_stale: false },
  ];
  const scores = { F14_A: NaN, F14_B: "not-a-number", F14_C: 0.5 };

  const out = aggregateByCategory(meta, scores);
  const f14 = out.find((c) => c.category === "F14");

  assert.equal(f14.total, 3);
  assert.equal(f14.scoredCount, 1);
  assert.equal(f14.mean, 0.5);
});

test("aggregateByCategory uses snapshot strategies as denominator", () => {
  const meta = Array.from({ length: 20 }, (_, i) => ({
    name: `F14_S${i}`,
    is_stale: false,
  }));
  const scores = {};
  for (let i = 0; i < 18; i++) scores[`F14_S${i}`] = 0.1 * (i + 1);

  const out = aggregateByCategory(meta, scores);
  const f14 = out.find((c) => c.category === "F14");

  assert.equal(f14.total, 20);
  assert.equal(f14.scoredCount, 18);
});

test("aggregateByCategory handles negative scores correctly", () => {
  const meta = [
    { name: "F14_A", is_stale: false },
    { name: "F14_B", is_stale: false },
    { name: "F14_C", is_stale: false },
  ];
  const scores = { F14_A: 0.5, F14_B: -0.3, F14_C: -0.1 };

  const out = aggregateByCategory(meta, scores);
  const f14 = out.find((c) => c.category === "F14");

  assert.equal(f14.scoredCount, 3);
  assert.ok(Math.abs(f14.mean - (0.5 - 0.3 - 0.1) / 3) < 1e-9);
  assert.equal(f14.max, 0.5);
  assert.equal(f14.maxStrategy, "F14_A");
  assert.equal(f14.min, -0.3);
  assert.equal(f14.minStrategy, "F14_B");
});

test("aggregateByCategory handles all-negative category", () => {
  const meta = [
    { name: "F28_X", is_stale: false },
    { name: "F28_Y", is_stale: false },
  ];
  const scores = { F28_X: -0.5, F28_Y: -0.1 };

  const out = aggregateByCategory(meta, scores);
  const f28 = out.find((c) => c.category === "F28");

  assert.equal(f28.max, -0.1);
  assert.equal(f28.min, -0.5);
});

test("aggregateByCategory absorbs orphan scores into categories", () => {
  const meta = [{ name: "F14_A", is_stale: false }];
  const scores = {
    F14_A: 0.5,
    Trading_Orphan: 0.3,
    F14_Ghost: 0.2,
  };

  const out = aggregateByCategory(meta, scores);
  const f14 = out.find((c) => c.category === "F14");
  const other = out.find((c) => c.category === "Trading_Orphan");

  assert.equal(f14.total, 2);
  assert.equal(f14.scoredCount, 2);
  assert.equal(other.total, 1);
  assert.equal(other.scoredCount, 1);
});

test("aggregateByCategory labels singleton non-F category by strategy name", () => {
  const meta = [{ name: "Trading_EE1", is_stale: false }];
  const scores = { Trading_EE1: 0 };

  const out = aggregateByCategory(meta, scores);

  assert.deepEqual(out.map((c) => c.category), ["Trading_EE1"]);
});

test("aggregateByCategory ignores orphan with non-finite score", () => {
  const meta = [];
  const scores = { F14_Ghost: NaN, F14_Real: 0.5 };

  const out = aggregateByCategory(meta, scores);
  const f14 = out.find((c) => c.category === "F14");

  assert.equal(f14.total, 1);
  assert.equal(f14.scoredCount, 1);
});

test("sortRows keeps null mean/max/min last in both directions", () => {
  const make = (category, mean, max, min) => ({
    category,
    mean,
    max,
    min,
    scoredCount: 0,
    total: 0,
  });
  const rows = [
    make("F14", 0.3, 0.5, 0.1),
    make("F28", null, null, null),
    make("F99", 0.1, 0.2, 0.05),
    make("其他", null, null, null),
  ];

  sortRows(rows, { key: "mean", dir: "asc" });
  assert.equal(rows[0].category, "F99");
  assert.equal(rows[1].category, "F14");
  assert.equal(rows.at(-1).mean, null);
  assert.equal(rows.at(-2).mean, null);

  sortRows(rows, { key: "mean", dir: "desc" });
  assert.equal(rows[0].category, "F14");
  assert.equal(rows[1].category, "F99");
  assert.equal(rows.at(-1).mean, null);
  assert.equal(rows.at(-2).mean, null);

  for (const key of ["max", "min"]) {
    for (const dir of ["asc", "desc"]) {
      sortRows(rows, { key, dir });
      assert.equal(rows.at(-1)[key], null, `${key} ${dir}: last is null`);
      assert.equal(rows.at(-2)[key], null, `${key} ${dir}: second last is null`);
    }
  }
});

test("sortRows sorts category strings ascending and descending", () => {
  const rows = [
    { category: "F28" },
    { category: "F14" },
    { category: "其他" },
  ];

  sortRows(rows, { key: "category", dir: "asc" });
  assert.deepEqual(
    rows.map((r) => r.category),
    ["F14", "F28", "其他"],
  );

  sortRows(rows, { key: "category", dir: "desc" });
  assert.deepEqual(
    rows.map((r) => r.category),
    ["其他", "F28", "F14"],
  );
});
