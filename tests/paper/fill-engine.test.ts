import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OrderbookFillEngine } from '../../src/polybot/paper/fill-engine.js';
import type { OrderbookSnapshot, BookLevel } from '../../src/polybot/models/orderbook.js';
import type { OrderIntent, PaperConfig } from '../../src/polybot/paper/models.js';
import { PAPER_DEFAULTS } from '../../src/polybot/paper/models.js';

function makeBook(
  bids: [number, number][],
  asks: [number, number][],
  tokenId = 'test-token',
): OrderbookSnapshot {
  const bidLevels: BookLevel[] = bids.map(([price, size]) => ({ price, size }));
  const askLevels: BookLevel[] = asks.map(([price, size]) => ({ price, size }));
  const bestBid = bidLevels[0]?.price;
  const bestAsk = askLevels[0]?.price;
  return {
    tokenId,
    bids: bidLevels,
    asks: askLevels,
    bestBid,
    bestAsk,
    midPrice: bestBid !== undefined && bestAsk !== undefined ? (bestBid + bestAsk) / 2 : undefined,
    spread: bestBid !== undefined && bestAsk !== undefined ? bestAsk - bestBid : undefined,
    capturedAt: new Date().toISOString(),
  };
}

function makeIntent(overrides: Partial<OrderIntent> = {}): OrderIntent {
  return {
    id: 'test-1',
    tokenId: 'test-token',
    side: 'buy',
    sizeShares: 10,
    orderType: 'FAK',
    signalSource: 'test',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

const config: PaperConfig = { ...PAPER_DEFAULTS };

describe('OrderbookFillEngine', () => {
  const engine = new OrderbookFillEngine(config);

  describe('FAK (Fill-And-Kill)', () => {
    it('fills completely when book has sufficient depth', () => {
      const book = makeBook(
        [[0.49, 100]],
        [[0.51, 100]],
      );
      const intent = makeIntent({ sizeShares: 10 });
      const fill = engine.tryFill(intent, book);

      assert.equal(fill.status, 'filled');
      assert.equal(fill.filledSize, 10);
      assert.equal(fill.remainderSize, 0);
      assert.equal(fill.effectivePrice, 0.51);
      assert.equal(fill.levels.length, 1);
    });

    it('partially fills and cancels remainder when depth is insufficient', () => {
      const book = makeBook(
        [[0.49, 100]],
        [[0.51, 5], [0.52, 3]], // Only 8 shares available
      );
      const intent = makeIntent({ sizeShares: 15, orderType: 'FAK' });
      const fill = engine.tryFill(intent, book);

      assert.equal(fill.status, 'partial');
      assert.equal(fill.filledSize, 8);
      assert.equal(fill.remainderSize, 7);
      assert.equal(fill.levels.length, 2);
      assert.equal(fill.levels[0].size, 5);
      assert.equal(fill.levels[1].size, 3);
    });
  });

  describe('FOK (Fill-Or-Kill)', () => {
    it('rejects when depth is insufficient', () => {
      const book = makeBook(
        [[0.49, 100]],
        [[0.51, 5]], // Only 5 shares available
      );
      const intent = makeIntent({ sizeShares: 10, orderType: 'FOK' });
      const fill = engine.tryFill(intent, book);

      assert.equal(fill.status, 'rejected');
      assert.equal(fill.filledSize, 0);
      assert.ok(fill.rejectReason?.includes('insufficient_depth_fok'));
    });

    it('fills completely when depth is sufficient', () => {
      const book = makeBook(
        [[0.49, 100]],
        [[0.51, 100]],
      );
      const intent = makeIntent({ sizeShares: 10, orderType: 'FOK' });
      const fill = engine.tryFill(intent, book);

      assert.equal(fill.status, 'filled');
      assert.equal(fill.filledSize, 10);
    });
  });

  describe('effective price worsens with depth', () => {
    it('VWAP increases when buy walks multiple ask levels', () => {
      const book = makeBook(
        [[0.48, 100]],
        [[0.50, 5], [0.52, 5], [0.55, 10]],
      );
      const intent = makeIntent({ sizeShares: 12 });
      const fill = engine.tryFill(intent, book);

      assert.equal(fill.status, 'filled');
      assert.equal(fill.filledSize, 12);
      // VWAP = (5*0.50 + 5*0.52 + 2*0.55) / 12 = (2.50 + 2.60 + 1.10) / 12 = 6.20 / 12
      const expectedVwap = (5 * 0.50 + 5 * 0.52 + 2 * 0.55) / 12;
      assert.ok(Math.abs(fill.effectivePrice - expectedVwap) < 1e-10,
        `VWAP ${fill.effectivePrice} should be ~${expectedVwap}`);
      // Effective price should be worse than best ask
      assert.ok(fill.effectivePrice > 0.50, 'VWAP should be worse than best ask');
    });

    it('VWAP decreases when sell walks multiple bid levels', () => {
      const book = makeBook(
        [[0.50, 3], [0.48, 5], [0.45, 10]], // bids sorted descending
        [[0.52, 100]],
      );
      const intent = makeIntent({ side: 'sell', sizeShares: 10 });
      const fill = engine.tryFill(intent, book);

      assert.equal(fill.status, 'filled');
      // VWAP = (3*0.50 + 5*0.48 + 2*0.45) / 10 = (1.50 + 2.40 + 0.90) / 10 = 4.80 / 10
      const expectedVwap = (3 * 0.50 + 5 * 0.48 + 2 * 0.45) / 10;
      assert.ok(Math.abs(fill.effectivePrice - expectedVwap) < 1e-10);
      assert.ok(fill.effectivePrice < 0.50, 'sell VWAP should be worse than best bid');
    });
  });

  describe('tick_size and min_order_size', () => {
    it('rejects order below min_order_size', () => {
      const book = makeBook([[0.49, 100]], [[0.51, 100]]);
      const intent = makeIntent({ sizeShares: 0.5 }); // below default minOrderSize=1
      const fill = engine.tryFill(intent, book);

      assert.equal(fill.status, 'rejected');
      assert.ok(fill.rejectReason?.includes('below_min_order_size'));
    });

    it('rejects limit price not on tick grid', () => {
      const book = makeBook([[0.49, 100]], [[0.51, 100]]);
      const intent = makeIntent({ limitPrice: 0.515 }); // not on 0.01 tick
      const fill = engine.tryFill(intent, book);

      assert.equal(fill.status, 'rejected');
      assert.ok(fill.rejectReason?.includes('limit_price_not_on_tick'));
    });

    it('accepts limit price on tick grid', () => {
      const book = makeBook([[0.49, 100]], [[0.51, 100]]);
      const intent = makeIntent({ limitPrice: 0.52 }); // on 0.01 tick
      const fill = engine.tryFill(intent, book);

      assert.equal(fill.status, 'filled');
    });
  });

  describe('limit orders', () => {
    it('buy stops at limit price', () => {
      const book = makeBook(
        [[0.48, 100]],
        [[0.50, 5], [0.52, 5], [0.55, 10]],
      );
      const intent = makeIntent({ sizeShares: 20, limitPrice: 0.52 });
      const fill = engine.tryFill(intent, book);

      assert.equal(fill.status, 'partial');
      assert.equal(fill.filledSize, 10); // 5@0.50 + 5@0.52, 0.55 is above limit
    });

    it('sell stops at limit price', () => {
      const book = makeBook(
        [[0.52, 5], [0.50, 5], [0.48, 10]],
        [[0.55, 100]],
      );
      const intent = makeIntent({ side: 'sell', sizeShares: 20, limitPrice: 0.50 });
      const fill = engine.tryFill(intent, book);

      assert.equal(fill.status, 'partial');
      assert.equal(fill.filledSize, 10); // 5@0.52 + 5@0.50, 0.48 is below limit
    });
  });

  describe('fees', () => {
    it('calculates taker fee on gross amount', () => {
      const book = makeBook([[0.49, 100]], [[0.51, 100]]);
      const intent = makeIntent({ sizeShares: 10 });
      const fill = engine.tryFill(intent, book);

      // grossAmount = 10 * 0.51 = 5.10
      // fee = 5.10 * (200 / 10000) = 0.102
      assert.ok(Math.abs(fill.grossAmount - 5.10) < 1e-10);
      assert.ok(Math.abs(fill.takerFee - 0.102) < 1e-10);
    });
  });

  describe('slippage', () => {
    it('calculates slippage vs midprice in bps', () => {
      const book = makeBook([[0.49, 100]], [[0.51, 100]]);
      const intent = makeIntent({ sizeShares: 10 });
      const fill = engine.tryFill(intent, book);

      // midPrice = (0.49 + 0.51) / 2 = 0.50
      // effectivePrice = 0.51
      // slippage = |0.51 - 0.50| / 0.50 * 10000 = 200 bps
      assert.ok(Math.abs(fill.slippageBps - 200) < 1);
    });
  });

  describe('notional conversion', () => {
    it('converts notionalUsdc to shares using best ask for buys', () => {
      const book = makeBook([[0.49, 100]], [[0.50, 100]]);
      const intent = makeIntent({ sizeShares: undefined, notionalUsdc: 5.0 });
      const fill = engine.tryFill(intent, book);

      // 5.0 USDC / 0.50 bestAsk = 10 shares
      assert.equal(fill.status, 'filled');
      assert.equal(fill.filledSize, 10);
    });
  });

  describe('edge cases', () => {
    it('rejects when book is empty', () => {
      const book = makeBook([], []);
      const intent = makeIntent();
      const fill = engine.tryFill(intent, book);

      assert.equal(fill.status, 'rejected');
      assert.ok(fill.rejectReason?.includes('no_liquidity'));
    });

    it('rejects when book is stale', () => {
      const staleBook = makeBook([[0.49, 100]], [[0.51, 100]]);
      // Set capturedAt to 60s ago
      (staleBook as { capturedAt: string }).capturedAt = new Date(Date.now() - 60_000).toISOString();
      const intent = makeIntent();
      const fill = engine.tryFill(intent, staleBook);

      assert.equal(fill.status, 'rejected');
      assert.ok(fill.rejectReason?.includes('stale_book'));
    });
  });
});
