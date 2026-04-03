/**
 * Smoke test: config loading and mode enforcement.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../../src/polybot/config/schema.js';

describe('Config', () => {
  it('defaults to readonly mode', () => {
    assert.equal(DEFAULTS.mode, 'readonly');
  });

  it('has valid Gamma base URL', () => {
    assert.ok(DEFAULTS.gamma.baseUrl.startsWith('https://'));
  });

  it('has valid CLOB base URL', () => {
    assert.ok(DEFAULTS.clob.baseUrl.startsWith('https://'));
  });

  it('has valid WS URL', () => {
    assert.ok(DEFAULTS.ws.url.startsWith('wss://'));
  });

  it('has positive rate limits', () => {
    assert.ok(DEFAULTS.gamma.rateLimitRps > 0);
    assert.ok(DEFAULTS.clob.rateLimitRps > 0);
  });
});
