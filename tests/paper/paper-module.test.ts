import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PaperModule } from '../../src/polybot/paper/paper-module.js';
import { StaticSignalProvider } from '../../src/polybot/paper/signal-providers.js';
import type { WsFrame } from '../../src/polybot/transport/ws-subscriber.js';
import type { DomainEvent } from '../../src/polybot/models/events.js';
import type { OrderIntent } from '../../src/polybot/paper/models.js';

function makeBookFrame(assetId: string, bids: [string, string][], asks: [string, string][]): WsFrame {
  return {
    eventType: 'book',
    raw: {
      event_type: 'book',
      asset_id: assetId,
      bids: bids.map(([price, size]) => ({ price, size })),
      asks: asks.map(([price, size]) => ({ price, size })),
    },
    receivedAt: new Date().toISOString(),
  };
}

function makePriceChangeFrame(assetId: string): WsFrame {
  return {
    eventType: 'price_change',
    raw: {
      event_type: 'price_change',
      asset_id: assetId,
      changes: [{ price: '0.51', side: 'BUY', size: '100' }],
    },
    receivedAt: new Date().toISOString(),
  };
}

const schemaConfig = {
  initialBalanceUsdc: 1000,
  maxPositionSizeUsdc: 100,
  maxOpenPositions: 5,
  defaultFeeRate: 0.05,
  tickSize: 0.01,
  minOrderSize: 1,
  staleBookThresholdMs: 30_000,
};

describe('PaperModule', () => {
  it('processes book frame and builds orderbook', async () => {
    const events: DomainEvent[] = [];
    const module = new PaperModule({
      schemaConfig,
      sessionId: 'test-session',
      recordEvent: async (e) => { events.push(e); },
    });

    // No signal providers — just test aggregator wiring
    module.setSignalProviders([]);

    await module.handleFrame(makeBookFrame('token-1', [['0.49', '100']], [['0.51', '200']]));

    assert.equal(module.metrics.framesProcessed, 1);
    assert.equal(module.metrics.booksTracked, 1);
    assert.equal(events.length, 0); // no signals, no events
  });

  it('end-to-end: book frame → signal → fill → events recorded', async () => {
    const events: DomainEvent[] = [];
    const module = new PaperModule({
      schemaConfig,
      sessionId: 'test-session',
      recordEvent: async (e) => { events.push(e); },
    });

    // Static signal that fires a buy on token-1
    const signal: OrderIntent = {
      id: 'sig-1',
      tokenId: 'token-1',
      side: 'buy',
      sizeShares: 5,
      orderType: 'FAK',
      signalSource: 'static',
      timestamp: new Date().toISOString(),
    };
    module.setSignalProviders([new StaticSignalProvider([signal])]);

    // First: send book frame to build orderbook
    await module.handleFrame(makeBookFrame('token-1', [['0.49', '100']], [['0.51', '200']]));

    // Then: send price_change frame to trigger signal evaluation
    await module.handleFrame(makePriceChangeFrame('token-1'));

    // Check metrics
    assert.equal(module.metrics.framesProcessed, 2);
    assert.equal(module.metrics.signalsGenerated, 1);
    assert.equal(module.metrics.fillsExecuted, 1);
    assert.equal(module.metrics.rejectsCount, 0);

    // Check events recorded
    const eventTypes = events.map(e => e.type);
    assert.ok(eventTypes.includes('paper_signal'), 'should record paper_signal');
    assert.ok(eventTypes.includes('paper_order'), 'should record paper_order');
    assert.ok(eventTypes.includes('paper_fill'), 'should record paper_fill');

    // Check portfolio state
    const stats = module.getSessionStats();
    assert.equal(stats.totalTrades, 1);
    assert.ok(module.metrics.cashBalance < 1000, 'cash should decrease after buy');
    assert.equal(module.metrics.openPositions, 1);
  });

  it('rejects fill when no orderbook available', async () => {
    const events: DomainEvent[] = [];
    const module = new PaperModule({
      schemaConfig,
      sessionId: 'test-session',
      recordEvent: async (e) => { events.push(e); },
    });

    // Signal for token that has no book
    const signal: OrderIntent = {
      id: 'sig-1',
      tokenId: 'no-book-token',
      side: 'buy',
      sizeShares: 5,
      orderType: 'FAK',
      signalSource: 'static',
      timestamp: new Date().toISOString(),
    };
    module.setSignalProviders([new StaticSignalProvider([signal])]);

    // price_change frame triggers signal but no book for this token
    await module.handleFrame(makePriceChangeFrame('no-book-token'));

    assert.equal(module.metrics.signalsGenerated, 1);
    assert.equal(module.metrics.rejectsCount, 1);
    assert.equal(module.metrics.fillsExecuted, 0);

    const rejectEvents = events.filter(e => e.type === 'paper_rejected');
    assert.equal(rejectEvents.length, 1);
  });

  it('snapshots portfolio', async () => {
    const events: DomainEvent[] = [];
    const module = new PaperModule({
      schemaConfig,
      sessionId: 'test-session',
      recordEvent: async (e) => { events.push(e); },
    });

    module.setSignalProviders([]);
    await module.snapshotPortfolio();

    const snapshots = events.filter(e => e.type === 'paper_portfolio_snapshot');
    assert.equal(snapshots.length, 1);
    const payload = snapshots[0].payload as Record<string, unknown>;
    assert.equal(payload.cashBalance, 1000);
  });

  it('mark-to-market updates unrealized P&L', async () => {
    const events: DomainEvent[] = [];
    const module = new PaperModule({
      schemaConfig,
      sessionId: 'test-session',
      recordEvent: async (e) => { events.push(e); },
    });

    // Buy signal
    const signal: OrderIntent = {
      id: 'sig-1',
      tokenId: 'token-1',
      side: 'buy',
      sizeShares: 10,
      orderType: 'FAK',
      signalSource: 'static',
      timestamp: new Date().toISOString(),
    };
    module.setSignalProviders([new StaticSignalProvider([signal])]);

    // Build book and trigger fill
    await module.handleFrame(makeBookFrame('token-1', [['0.49', '100']], [['0.51', '200']]));
    await module.handleFrame(makePriceChangeFrame('token-1'));

    // Now change the book to a higher price
    await module.handleFrame(makeBookFrame('token-1', [['0.59', '100']], [['0.61', '200']]));

    // Mark to market
    module.markToMarket();

    const stats = module.getSessionStats();
    // Bought near 0.51, mid now 0.60 — should have unrealized profit
    assert.ok(stats.unrealizedPnl > 0, `unrealized PnL should be positive, got ${stats.unrealizedPnl}`);
  });

  it('per-token fee rate override applies', async () => {
    const events: DomainEvent[] = [];
    const module = new PaperModule({
      schemaConfig,
      sessionId: 'test-session',
      recordEvent: async (e) => { events.push(e); },
    });

    // Set custom fee rate for token-1 (0.03 instead of default 0.05)
    module.setFeeRateOverrides(new Map([['token-1', 0.03]]));

    const signal: OrderIntent = {
      id: 'sig-1',
      tokenId: 'token-1',
      side: 'buy',
      sizeShares: 10,
      orderType: 'FAK',
      signalSource: 'static',
      timestamp: new Date().toISOString(),
    };
    module.setSignalProviders([new StaticSignalProvider([signal])]);

    await module.handleFrame(makeBookFrame('token-1', [['0.49', '100']], [['0.51', '200']]));
    await module.handleFrame(makePriceChangeFrame('token-1'));

    const fillEvents = events.filter(e => e.type === 'paper_fill');
    assert.equal(fillEvents.length, 1);
    const fill = (fillEvents[0].payload as Record<string, unknown>).fill as Record<string, unknown>;
    assert.equal(fill.feeRate, 0.03);
  });
});
