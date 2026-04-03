/**
 * Tests for JSONL recorder session tracking and replay integrity.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { JsonlRecorder } from '../../src/polybot/recorder/jsonl-recorder.js';
import { DEFAULTS } from '../../src/polybot/config/schema.js';

const TEST_DIR = join(process.cwd(), 'data', 'test-recordings');

describe('JsonlRecorder', () => {
  it('writes session_meta, events, summary, and session_end', async () => {
    mkdirSync(TEST_DIR, { recursive: true });

    const config = { ...DEFAULTS, recorder: { ...DEFAULTS.recorder, dir: TEST_DIR } };
    const recorder = new JsonlRecorder(config.recorder, config);
    await recorder.start('test-session');

    await recorder.record({
      type: 'ws_book',
      timestamp: new Date().toISOString(),
      source: 'test',
      sessionId: 'test-session',
      payload: { bids: [], asks: [] },
    });

    await recorder.record({
      type: 'ws_price_change',
      timestamp: new Date().toISOString(),
      source: 'test',
      sessionId: 'test-session',
      payload: { price: '0.5' },
    });

    recorder.trackReconnect();

    await recorder.stop();

    // Read and parse the JSONL file
    const content = readFileSync(join(TEST_DIR, 'session-test-session.jsonl'), 'utf-8');
    const lines = content.trim().split('\n').map(l => JSON.parse(l));

    // Verify structure
    assert.equal(lines[0].type, 'session_meta');
    assert.equal(lines[0].sessionId, 'test-session');

    assert.equal(lines[1].type, 'ws_book');
    assert.equal(lines[2].type, 'ws_price_change');

    // Session summary
    const summary = lines[3];
    assert.equal(summary.type, 'session_summary');
    assert.equal(summary.totalEvents, 2);
    assert.equal(summary.reconnectCount, 1);
    assert.equal(summary.eventCounts.ws_book, 1);
    assert.equal(summary.eventCounts.ws_price_change, 1);
    assert.ok(summary.durationMs >= 0);

    // Session end
    assert.equal(lines[4].type, 'session_end');

    // Stats
    const stats = recorder.stats;
    assert.equal(stats.eventCount, 2);
    assert.equal(stats.reconnectCount, 1);

    // Cleanup
    rmSync(TEST_DIR, { recursive: true, force: true });
  });
});
