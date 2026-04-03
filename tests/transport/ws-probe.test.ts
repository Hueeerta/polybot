/**
 * Transport test: WS probe against a known-bad endpoint should fail gracefully.
 * Does NOT require network — tests error handling with invalid URL.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WsProbe } from '../../src/polybot/transport/ws-probe.js';

describe('WsProbe', () => {
  it('returns unreachable with error for invalid URL', async () => {
    const probe = new WsProbe('wss://localhost:1', 2000);
    const result = await probe.probe();
    assert.equal(result.reachable, false);
    assert.equal(result.state, 'disconnected');
    assert.ok(result.latencyMs >= 0);
    assert.ok(typeof result.error === 'string' && result.error.length > 0,
      `Expected error string, got: ${result.error}`);
  });
});
