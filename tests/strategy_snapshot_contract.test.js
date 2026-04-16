import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const snapshotPath = path.join(repoRoot, "scorecard_web.json");

test("scorecard_web.json is tracked as a deployable asset", () => {
  const stdout = execFileSync("git", ["ls-files", "--error-unmatch", "scorecard_web.json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(stdout.trim(), "scorecard_web.json");
});

test("scorecard_web.json satisfies the minimum strategy snapshot contract", () => {
  assert.equal(fs.existsSync(snapshotPath), true);

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  assert.equal(typeof snapshot.as_of, "string");
  assert.equal(Array.isArray(snapshot.strategies), true);
  assert.equal(typeof snapshot.tickers, "object");
  assert.notEqual(snapshot.tickers, null);

  const tickerEntries = Object.values(snapshot.tickers);
  assert.equal(tickerEntries.length > 0, true);
  assert.equal(
    tickerEntries.some((entry) => {
      const strategyScores = entry?.strategy_scores;
      return (
        strategyScores &&
        typeof strategyScores === "object" &&
        Object.keys(strategyScores).length > 0
      );
    }),
    true,
  );
});
