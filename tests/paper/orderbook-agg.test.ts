import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OrderbookAggregator } from '../../src/polybot/transport/orderbook-agg.js';
import type { WsFrame } from '../../src/polybot/transport/ws-subscriber.js';

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

function makePriceChangeFrame(assetId: string, changes: Array<{ price: string; side: string; size: string }>): WsFrame {
  return {
    eventType: 'price_change',
    raw: {
      event_type: 'price_change',
      asset_id: assetId,
      changes,
    },
    receivedAt: new Date().toISOString(),
  };
}

describe('OrderbookAggregator', () => {
  it('stores book snapshot from book frame', () => {
    const agg = new OrderbookAggregator();
    agg.handleFrame(makeBookFrame('token-1', [['0.49', '100']], [['0.51', '200']]));

    const book = agg.getLatestBook('token-1');
    assert.ok(book);
    assert.equal(book.tokenId, 'token-1');
    assert.equal(book.bids.length, 1);
    assert.equal(book.asks.length, 1);
    assert.equal(book.bestBid, 0.49);
    assert.equal(book.bestAsk, 0.51);
    assert.ok(Math.abs(book.midPrice! - 0.50) < 1e-10);
  });

  it('replaces book on new book frame', () => {
    const agg = new OrderbookAggregator();
    agg.handleFrame(makeBookFrame('token-1', [['0.49', '100']], [['0.51', '200']]));
    agg.handleFrame(makeBookFrame('token-1', [['0.55', '50']], [['0.57', '150']]));

    const book = agg.getLatestBook('token-1');
    assert.ok(book);
    assert.equal(book.bestBid, 0.55);
    assert.equal(book.bestAsk, 0.57);
  });

  it('returns undefined for unknown tokenId', () => {
    const agg = new OrderbookAggregator();
    assert.equal(agg.getLatestBook('unknown'), undefined);
  });

  it('applies price_change incrementally', () => {
    const agg = new OrderbookAggregator();
    // Initial book
    agg.handleFrame(makeBookFrame('token-1', [['0.49', '100']], [['0.51', '200']]));

    // Update: new ask level at 0.52
    agg.handleFrame(makePriceChangeFrame('token-1', [
      { price: '0.52', side: 'SELL', size: '50' },
    ]));

    const book = agg.getLatestBook('token-1');
    assert.ok(book);
    assert.equal(book.asks.length, 2);
    assert.equal(book.asks[0].price, 0.51); // still best ask
    assert.equal(book.asks[1].price, 0.52);
    assert.equal(book.asks[1].size, 50);
  });

  it('removes level when size is 0', () => {
    const agg = new OrderbookAggregator();
    agg.handleFrame(makeBookFrame('token-1', [['0.49', '100'], ['0.48', '50']], [['0.51', '200']]));

    agg.handleFrame(makePriceChangeFrame('token-1', [
      { price: '0.49', side: 'BUY', size: '0' },
    ]));

    const book = agg.getLatestBook('token-1');
    assert.ok(book);
    assert.equal(book.bids.length, 1);
    assert.equal(book.bestBid, 0.48);
  });

  it('updates existing level size', () => {
    const agg = new OrderbookAggregator();
    agg.handleFrame(makeBookFrame('token-1', [['0.49', '100']], [['0.51', '200']]));

    agg.handleFrame(makePriceChangeFrame('token-1', [
      { price: '0.51', side: 'SELL', size: '300' },
    ]));

    const book = agg.getLatestBook('token-1');
    assert.ok(book);
    assert.equal(book.asks[0].size, 300);
  });

  it('ignores price_change for unknown tokenId', () => {
    const agg = new OrderbookAggregator();
    // No initial book — should not crash
    agg.handleFrame(makePriceChangeFrame('unknown', [
      { price: '0.51', side: 'SELL', size: '100' },
    ]));
    assert.equal(agg.getLatestBook('unknown'), undefined);
  });

  it('handles real Polymarket price_changes[] format', () => {
    const agg = new OrderbookAggregator();
    // Set up initial books for two tokens
    agg.handleFrame(makeBookFrame('token-1', [['0.49', '100']], [['0.51', '200']]));
    agg.handleFrame(makeBookFrame('token-2', [['0.30', '50']], [['0.35', '150']]));

    // Real WS format: price_changes[] array with per-asset entries
    const realFrame: WsFrame = {
      eventType: 'price_change',
      raw: {
        event_type: 'price_change',
        market: '0xabc123',
        price_changes: [
          { asset_id: 'token-1', price: '0.52', size: '300', side: 'SELL' },
          { asset_id: 'token-2', price: '0.31', size: '75', side: 'BUY' },
        ],
      },
      receivedAt: new Date().toISOString(),
    };
    agg.handleFrame(realFrame);

    // token-1 should have new ask at 0.52 with size 300
    const book1 = agg.getLatestBook('token-1');
    assert.ok(book1);
    const ask52 = book1.asks.find(a => Math.abs(a.price - 0.52) < 1e-10);
    assert.ok(ask52, 'should have ask at 0.52');
    assert.equal(ask52.size, 300);

    // token-2 should have new bid at 0.31 with size 75
    const book2 = agg.getLatestBook('token-2');
    assert.ok(book2);
    const bid31 = book2.bids.find(b => Math.abs(b.price - 0.31) < 1e-10);
    assert.ok(bid31, 'should have bid at 0.31');
    assert.equal(bid31.size, 75);
  });

  it('tracks multiple tokens independently', () => {
    const agg = new OrderbookAggregator();
    agg.handleFrame(makeBookFrame('token-1', [['0.49', '100']], [['0.51', '200']]));
    agg.handleFrame(makeBookFrame('token-2', [['0.30', '50']], [['0.35', '150']]));

    assert.ok(agg.getLatestBook('token-1'));
    assert.ok(agg.getLatestBook('token-2'));
    assert.equal(agg.tokenIds.length, 2);
    assert.equal(agg.getLatestBook('token-1')!.bestBid, 0.49);
    assert.equal(agg.getLatestBook('token-2')!.bestBid, 0.30);
  });
});
