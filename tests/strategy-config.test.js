import test from 'node:test';
import assert from 'node:assert/strict';

import { getStrategyDataUrls } from '../js/modules/strategy.js';

test('uses configured base URL for strategy summary files', () => {
  assert.deepEqual(getStrategyDataUrls('../'), {
    holding: '../strategy_ticker_holding_summary.csv',
    trade: '../strategy_ticker_trade_analysis_summary.csv',
  });
});

test('falls back to the in-app data directory when base URL is missing', () => {
  assert.deepEqual(getStrategyDataUrls(), {
    holding: 'data/strategy_ticker_holding_summary.csv',
    trade: 'data/strategy_ticker_trade_analysis_summary.csv',
  });
});
