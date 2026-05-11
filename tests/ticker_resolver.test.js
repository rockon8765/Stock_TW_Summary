import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resetTickerResolverForTests,
  resolveTickerInput,
} from "../js/lib/ticker_resolver.js";

afterEach(() => {
  resetTickerResolverForTests();
});

test("resolveTickerInput keeps numeric ticker input unchanged", async () => {
  let calls = 0;
  const result = await resolveTickerInput("2330", {
    ensureLoad: async () => {
      calls += 1;
      return { status: "loaded", holdingData: [] };
    },
  });

  assert.equal(result, "2330");
  assert.equal(calls, 0);
});

test("resolveTickerInput resolves exact and unique partial Chinese names", async () => {
  const ensureLoad = async () => ({
    status: "loaded",
    holdingData: [
      { 股票代號: "2330", 股票名稱: "台積電" },
      { 股票代號: "1101", 股票名稱: "台泥" },
    ],
  });

  assert.equal(await resolveTickerInput("台積電", { ensureLoad }), "2330");
  assert.equal(await resolveTickerInput("台積", { ensureLoad }), "2330");
});

test("resolveTickerInput returns null for ambiguous or missing names", async () => {
  const ensureLoad = async () => ({
    status: "loaded",
    holdingData: [
      { 股票代號: "1111", 股票名稱: "光一" },
      { 股票代號: "2222", 股票名稱: "光二" },
    ],
  });

  assert.equal(await resolveTickerInput("光", { ensureLoad }), null);
  assert.equal(await resolveTickerInput("不存在", { ensureLoad }), null);
  assert.equal(await resolveTickerInput("", { ensureLoad }), null);
});

test("resolveTickerInput does not cache failed or pending strategy loads", async () => {
  const states = [
    { status: "failed", holdingData: [] },
    { status: "pending", holdingData: [] },
    {
      status: "loaded",
      holdingData: [{ 股票代號: "2330", 股票名稱: "台積電" }],
    },
  ];
  let calls = 0;
  const ensureLoad = async () => {
    calls += 1;
    return states.shift();
  };

  assert.equal(await resolveTickerInput("台積電", { ensureLoad }), null);
  assert.equal(await resolveTickerInput("台積電", { ensureLoad }), null);
  assert.equal(await resolveTickerInput("台積電", { ensureLoad }), "2330");
  assert.equal(calls, 3);
});
