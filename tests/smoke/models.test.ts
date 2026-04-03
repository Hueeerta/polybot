/**
 * Smoke test: domain models are properly typed and constructable.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Market, Outcome } from '../../src/polybot/models/market.js';
import type { OrderbookSnapshot, BookLevel } from '../../src/polybot/models/orderbook.js';
import type { DomainEvent } from '../../src/polybot/models/events.js';

describe('Models', () => {
  it('can construct a Market', () => {
    const outcome: Outcome = { label: 'Yes', tokenId: '123' };
    const market: Market = {
      conditionId: 'cond-1',
      slug: 'test-market',
      question: 'Will this test pass?',
      outcomes: [outcome],
      active: true,
    };
    assert.equal(market.slug, 'test-market');
    assert.equal(market.outcomes.length, 1);
  });

  it('can construct an OrderbookSnapshot', () => {
    const level: BookLevel = { price: 0.55, size: 100 };
    const snapshot: OrderbookSnapshot = {
      tokenId: '123',
      bids: [level],
      asks: [{ price: 0.60, size: 50 }],
      bestBid: 0.55,
      bestAsk: 0.60,
      midPrice: 0.575,
      spread: 0.05,
      capturedAt: new Date().toISOString(),
    };
    assert.equal(snapshot.spread, 0.05);
  });

  it('can construct a DomainEvent', () => {
    const event: DomainEvent<{ test: boolean }> = {
      type: 'health_check',
      timestamp: new Date().toISOString(),
      source: 'test',
      sessionId: 'test-session',
      payload: { test: true },
    };
    assert.equal(event.type, 'health_check');
  });
});
