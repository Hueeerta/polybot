/**
 * Tests for WsSubscriber — frame classification, counting, resubscription.
 * Uses a fake WsConnection (no real WebSocket).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WsSubscriber, type WsFrame } from '../../src/polybot/transport/ws-subscriber.js';

/** Minimal fake that satisfies WsSubscriber's usage of WsConnection */
class FakeConnection {
  private messageHandlers: Array<(data: unknown) => void> = [];
  private reconnectedHandlers: Array<() => void> = [];
  sent: string[] = [];

  onMessage(handler: (data: unknown) => void): void {
    this.messageHandlers.push(handler);
  }

  onReconnected(handler: () => void): void {
    this.reconnectedHandlers.push(handler);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  // Test helpers
  simulateMessage(data: unknown): void {
    for (const h of this.messageHandlers) h(data);
  }

  simulateReconnect(): void {
    for (const h of this.reconnectedHandlers) h();
  }
}

describe('WsSubscriber', () => {
  it('sends subscription with decimal token IDs', () => {
    const conn = new FakeConnection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = new WsSubscriber(conn as any, { marketCount: 3, customFeatureEnabled: false });
    const ids = ['123456789', '987654321'];
    sub.subscribe(ids);

    assert.equal(conn.sent.length, 1);
    const msg = JSON.parse(conn.sent[0]);
    assert.deepEqual(msg.assets_ids, ids);
    assert.equal(msg.type, 'market');
    assert.equal(msg.initial_dump, true);
  });

  it('classifies book frames', () => {
    const conn = new FakeConnection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = new WsSubscriber(conn as any, { marketCount: 3, customFeatureEnabled: false });

    const frames: WsFrame[] = [];
    sub.onFrame(f => frames.push(f));

    conn.simulateMessage({
      event_type: 'book',
      asset_id: '123',
      bids: [{ price: '0.5', size: '100' }],
      asks: [{ price: '0.6', size: '200' }],
    });

    assert.equal(frames.length, 1);
    assert.equal(frames[0].eventType, 'book');
    assert.equal(sub.stats.totalFrames, 1);
    assert.equal(sub.stats.frameCounts.book, 1);
  });

  it('classifies price_change frames', () => {
    const conn = new FakeConnection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = new WsSubscriber(conn as any, { marketCount: 3, customFeatureEnabled: false });

    const frames: WsFrame[] = [];
    sub.onFrame(f => frames.push(f));

    conn.simulateMessage({
      event_type: 'price_change',
      market: '0xabc',
      price_changes: [{ asset_id: '123', price: '0.5', size: '100', side: 'BUY' }],
    });

    assert.equal(frames.length, 1);
    assert.equal(frames[0].eventType, 'price_change');
  });

  it('classifies last_trade_price frames', () => {
    const conn = new FakeConnection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = new WsSubscriber(conn as any, { marketCount: 3, customFeatureEnabled: false });

    const frames: WsFrame[] = [];
    sub.onFrame(f => frames.push(f));

    conn.simulateMessage({
      event_type: 'last_trade_price',
      price: '0.45',
      size: '200',
      side: 'SELL',
    });

    assert.equal(frames.length, 1);
    assert.equal(frames[0].eventType, 'last_trade_price');
  });

  it('ignores empty arrays (subscription ack)', () => {
    const conn = new FakeConnection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = new WsSubscriber(conn as any, { marketCount: 3, customFeatureEnabled: false });

    const frames: WsFrame[] = [];
    sub.onFrame(f => frames.push(f));

    conn.simulateMessage([]);

    assert.equal(frames.length, 0);
    assert.equal(sub.stats.totalFrames, 0);
  });

  it('handles arrays of frames (initial dump)', () => {
    const conn = new FakeConnection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = new WsSubscriber(conn as any, { marketCount: 3, customFeatureEnabled: false });

    const frames: WsFrame[] = [];
    sub.onFrame(f => frames.push(f));

    conn.simulateMessage([
      { event_type: 'book', asset_id: '111', bids: [], asks: [] },
      { event_type: 'book', asset_id: '222', bids: [], asks: [] },
    ]);

    assert.equal(frames.length, 2);
    assert.equal(sub.stats.totalFrames, 2);
    assert.equal(sub.stats.frameCounts.book, 2);
  });

  it('resubscribes after reconnect', () => {
    const conn = new FakeConnection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = new WsSubscriber(conn as any, { marketCount: 3, customFeatureEnabled: false });

    sub.subscribe(['token-1', 'token-2']);
    assert.equal(conn.sent.length, 1);

    // Simulate reconnect
    conn.simulateReconnect();
    assert.equal(conn.sent.length, 2);

    const resub = JSON.parse(conn.sent[1]);
    assert.deepEqual(resub.assets_ids, ['token-1', 'token-2']);
  });

  it('ignores objects without event_type', () => {
    const conn = new FakeConnection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = new WsSubscriber(conn as any, { marketCount: 3, customFeatureEnabled: false });

    const frames: WsFrame[] = [];
    sub.onFrame(f => frames.push(f));

    conn.simulateMessage({ some: 'random', data: true });

    assert.equal(frames.length, 0);
  });
});
