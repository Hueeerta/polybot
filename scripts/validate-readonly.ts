/**
 * Pre-merge validation: proves the read-only data flow works end-to-end
 * against production Polymarket APIs.
 *
 * 1. Discovers a real market via Gamma API, extracts a token ID
 * 2. Fetches a real orderbook from CLOB API using that token
 * 3. Connects to WebSocket, subscribes to the market, waits for a real frame
 * 4. Records all events via JSONL recorder
 * 5. Shuts down cleanly
 *
 * Exit 0 = all validations passed. Exit 1 = something failed.
 */

import { GammaAdapter } from '../src/polybot/api/gamma-adapter.js';
import { ClobAdapter } from '../src/polybot/api/clob-adapter.js';
import { JsonlRecorder } from '../src/polybot/recorder/jsonl-recorder.js';
import { DEFAULTS } from '../src/polybot/config/schema.js';
import WebSocket from 'ws';

const SESSION_ID = 'validate-' + Date.now().toString(36);
const WS_TIMEOUT_MS = 15_000; // max wait for a WS frame

async function main() {
  const recorder = new JsonlRecorder(DEFAULTS.recorder, DEFAULTS);
  await recorder.start(SESSION_ID);

  let exitCode = 0;

  try {
    // ── Step 1: Discover a real market ──
    console.log('\n── Step 1: Market discovery (Gamma API) ──');
    const gamma = new GammaAdapter(DEFAULTS.gamma);
    const markets = await gamma.getMarkets({ limit: 3 });

    if (markets.length === 0) {
      console.error('FAIL: No markets returned from Gamma API');
      exitCode = 1;
      return;
    }

    const market = markets[0];
    const tokenId = market.outcomes[0]?.tokenId;

    console.log(`  Market: "${market.question}"`);
    console.log(`  Slug:   ${market.slug}`);
    console.log(`  Token:  ${tokenId}`);
    console.log(`  Outcomes: ${market.outcomes.map(o => o.label).join(', ')}`);
    console.log('  PASS: Market discovered with valid token ID');

    await recorder.record({
      type: 'market_snapshot',
      timestamp: new Date().toISOString(),
      source: 'validate-readonly',
      sessionId: SESSION_ID,
      payload: market,
    });

    if (!tokenId) {
      console.error('FAIL: Market has no token ID');
      exitCode = 1;
      return;
    }

    // ── Step 2: Fetch real orderbook (CLOB API) ──
    console.log('\n── Step 2: Orderbook fetch (CLOB API) ──');
    const clob = new ClobAdapter(DEFAULTS.clob);
    const book = await clob.getOrderbook(tokenId);

    console.log(`  Token:    ${book.tokenId}`);
    console.log(`  Bids:     ${book.bids.length} levels`);
    console.log(`  Asks:     ${book.asks.length} levels`);
    console.log(`  Best bid: ${book.bestBid}`);
    console.log(`  Best ask: ${book.bestAsk}`);
    console.log(`  Mid:      ${book.midPrice}`);
    console.log(`  Spread:   ${book.spread}`);

    if (book.bids.length === 0 && book.asks.length === 0) {
      console.error('FAIL: Orderbook is completely empty');
      exitCode = 1;
      return;
    }

    console.log('  PASS: Orderbook fetched with real levels');

    await recorder.record({
      type: 'orderbook_snapshot',
      timestamp: new Date().toISOString(),
      source: 'validate-readonly',
      sessionId: SESSION_ID,
      payload: book,
    });

    // ── Step 3: WebSocket frame reception ──
    console.log('\n── Step 3: WebSocket subscription (real frame) ──');
    // assets_ids needs DECIMAL token IDs, NOT hex condition IDs
    const allTokenIds = market.outcomes.map(o => o.tokenId).filter(Boolean);
    console.log(`  Subscribing with ${allTokenIds.length} token IDs`);

    const wsFrame = await receiveWsFrame(allTokenIds);

    if (wsFrame) {
      console.log(`  Frame type: ${wsFrame.event_type || wsFrame.type || 'unknown'}`);
      console.log(`  Frame keys: ${Object.keys(wsFrame).join(', ')}`);
      console.log('  PASS: Real WebSocket frame received');

      await recorder.record({
        type: 'ws_frame',
        timestamp: new Date().toISOString(),
        source: 'validate-readonly',
        sessionId: SESSION_ID,
        payload: wsFrame,
      });
    } else {
      console.error(`FAIL: No WS frame received within ${WS_TIMEOUT_MS / 1000}s`);
      exitCode = 1;
      return;
    }

  } catch (err) {
    console.error('\nFAIL:', err instanceof Error ? err.message : err);
    exitCode = 1;
  } finally {
    // ── Step 4: Clean shutdown ──
    console.log('\n── Step 4: Shutdown ──');
    await recorder.record({
      type: 'session_end',
      timestamp: new Date().toISOString(),
      source: 'validate-readonly',
      sessionId: SESSION_ID,
      payload: { exitCode },
    });
    await recorder.stop();
    console.log('  Recorder stopped, JSONL flushed');

    if (exitCode === 0) {
      console.log('\n✓ ALL VALIDATIONS PASSED\n');
    } else {
      console.log('\n✗ VALIDATION FAILED\n');
    }
    process.exit(exitCode);
  }
}

/**
 * Connects to Polymarket WS, subscribes using decimal token IDs,
 * waits for one real data frame (book, price_change, last_trade_price),
 * then disconnects.
 */
function receiveWsFrame(tokenIds: string[]): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const ws = new WebSocket(DEFAULTS.ws.url);
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close(1000);
        resolve(null);
      }
    }, WS_TIMEOUT_MS);

    ws.on('open', () => {
      console.log('  WS connected');

      // Polymarket protocol: assets_ids takes DECIMAL token IDs
      // initial_dump: true triggers an immediate book snapshot
      const subscribeMsg = JSON.stringify({
        assets_ids: tokenIds,
        type: 'market',
        initial_dump: true,
      });
      ws.send(subscribeMsg);
      console.log(`  Subscription sent (${tokenIds.length} assets)`);
    });

    ws.on('message', (data) => {
      const raw = data.toString();

      // Polymarket sends text "PONG" as keepalive response
      if (raw === 'PONG') return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.log(`  Non-JSON frame: ${raw.slice(0, 100)}`);
        return;
      }

      // Skip empty arrays (server ack with no data)
      if (Array.isArray(parsed) && parsed.length === 0) {
        console.log('  Empty array (subscription ack, no data)');
        return;
      }

      // Handle array of events (initial dump can be an array)
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0] as Record<string, unknown>;
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.log(`  Array frame (${parsed.length} items): ${raw.slice(0, 300)}`);
          ws.close(1000);
          resolve(first);
        }
        return;
      }

      // Single object frame
      const obj = parsed as Record<string, unknown>;
      const eventType = String(obj.event_type || obj.type || '');

      // Real data frames: book, price_change, last_trade_price, tick_size_change
      if (eventType && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        console.log(`  Data frame [${eventType}]: ${raw.slice(0, 300)}`);
        ws.close(1000);
        resolve(obj);
      }
    });

    ws.on('error', (err) => {
      console.error(`  WS error: ${err.message}`);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(null);
      }
    });

    ws.on('close', () => {
      console.log('  WS disconnected');
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(null);
      }
    });
  });
}

main();
