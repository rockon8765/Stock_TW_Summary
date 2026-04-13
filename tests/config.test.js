import test from 'node:test';
import assert from 'node:assert/strict';

import { APP_CONFIG } from '../js/config.js';

test('exports the default strategy summary base URL from config.js', () => {
  assert.equal(APP_CONFIG.strategyDataBaseUrl, './');
});
