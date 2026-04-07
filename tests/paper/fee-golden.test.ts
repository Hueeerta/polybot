/**
 * Golden tests against Polymarket's official fee table.
 *
 * Source: https://docs.polymarket.com/trading/fees
 * Formula: fee = C × feeRate × p × (1 - p)
 *
 * Fee rates by category:
 *   Crypto:                          0.072
 *   Sports:                          0.03
 *   Finance/Politics/Mentions/Tech:  0.04
 *   Economics/Culture/Weather/Other:  0.05
 *   Geopolitics:                     0 (free)
 *
 * Fees collected in shares on buys, USDC on sells.
 * Fee is symmetric: same USDC fee at p and (1-p).
 * Fee is maximized at p=0.50.
 */

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
    id: 'golden-1',
    tokenId: 'test-token',
    side: 'buy',
    sizeShares: 100,
    orderType: 'FAK',
    signalSource: 'golden-test',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// Fee tolerance: 5 decimal places (Polymarket rounds to 5 dp)
const FEE_TOLERANCE = 0.000015;

function makeConfig(feeRate: number): PaperConfig {
  return { ...PAPER_DEFAULTS, defaultFeeRate: feeRate };
}

describe('Fee golden tests (Polymarket official formula)', () => {
  describe('Sports (feeRate=0.03), 100 shares at p=0.50', () => {
    const engine = new OrderbookFillEngine(makeConfig(0.03));

    it('BUY: fee_usdc = 100 * 0.03 * 0.50 * 0.50 = $0.75', () => {
      const book = makeBook([[0.49, 1000]], [[0.50, 1000]]);
      const fill = engine.tryFill(makeIntent({ sizeShares: 100 }), book);

      assert.equal(fill.status, 'filled');
      assert.equal(fill.feeRate, 0.03);

      const expectedFeeUsdc = 100 * 0.03 * 0.50 * 0.50; // 0.75
      assert.ok(Math.abs(fill.takerFee - expectedFeeUsdc) < FEE_TOLERANCE,
        `takerFee ${fill.takerFee} should be ${expectedFeeUsdc}`);

      // Buy fee in shares: 0.75 / 0.50 = 1.50
      const expectedFeeShares = expectedFeeUsdc / 0.50;
      assert.ok(Math.abs(fill.feeShares - expectedFeeShares) < FEE_TOLERANCE,
        `feeShares ${fill.feeShares} should be ${expectedFeeShares}`);
    });

    it('SELL: fee_usdc = 100 * 0.03 * 0.50 * 0.50 = $0.75', () => {
      const book = makeBook([[0.50, 1000]], [[0.51, 1000]]);
      const fill = engine.tryFill(makeIntent({ side: 'sell', sizeShares: 100 }), book);

      assert.equal(fill.status, 'filled');
      const expectedFeeUsdc = 100 * 0.03 * 0.50 * 0.50;
      assert.ok(Math.abs(fill.takerFee - expectedFeeUsdc) < FEE_TOLERANCE,
        `takerFee ${fill.takerFee} should be ${expectedFeeUsdc}`);
      assert.equal(fill.feeShares, 0, 'sell fee should be in USDC, not shares');
    });
  });

  describe('Finance/Politics (feeRate=0.04), 100 shares at p=0.50', () => {
    const engine = new OrderbookFillEngine(makeConfig(0.04));

    it('BUY: fee_usdc = 100 * 0.04 * 0.50 * 0.50 = $1.00', () => {
      const book = makeBook([[0.49, 1000]], [[0.50, 1000]]);
      const fill = engine.tryFill(makeIntent({ sizeShares: 100 }), book);

      const expectedFeeUsdc = 100 * 0.04 * 0.50 * 0.50; // 1.00
      assert.ok(Math.abs(fill.takerFee - expectedFeeUsdc) < FEE_TOLERANCE,
        `takerFee ${fill.takerFee} should be ${expectedFeeUsdc}`);
    });
  });

  describe('Economics/Weather/Other (feeRate=0.05), 100 shares at p=0.50', () => {
    const engine = new OrderbookFillEngine(makeConfig(0.05));

    it('BUY: fee_usdc = 100 * 0.05 * 0.50 * 0.50 = $1.25', () => {
      const book = makeBook([[0.49, 1000]], [[0.50, 1000]]);
      const fill = engine.tryFill(makeIntent({ sizeShares: 100 }), book);

      const expectedFeeUsdc = 100 * 0.05 * 0.50 * 0.50; // 1.25
      assert.ok(Math.abs(fill.takerFee - expectedFeeUsdc) < FEE_TOLERANCE,
        `takerFee ${fill.takerFee} should be ${expectedFeeUsdc}`);
    });
  });

  describe('Crypto (feeRate=0.072), 100 shares at p=0.50', () => {
    const engine = new OrderbookFillEngine(makeConfig(0.072));

    it('BUY: fee_usdc = 100 * 0.072 * 0.50 * 0.50 = $1.80', () => {
      const book = makeBook([[0.49, 1000]], [[0.50, 1000]]);
      const fill = engine.tryFill(makeIntent({ sizeShares: 100 }), book);

      const expectedFeeUsdc = 100 * 0.072 * 0.50 * 0.50; // 1.80
      assert.ok(Math.abs(fill.takerFee - expectedFeeUsdc) < FEE_TOLERANCE,
        `takerFee ${fill.takerFee} should be ${expectedFeeUsdc}`);
    });
  });

  describe('symmetric price points (p=0.30 and p=0.70)', () => {
    const engine = new OrderbookFillEngine(makeConfig(0.03));

    it('BUY at p=0.30: fee_usdc = 100 * 0.03 * 0.30 * 0.70 = $0.63', () => {
      const book = makeBook([[0.29, 1000]], [[0.30, 1000]]);
      const fill = engine.tryFill(makeIntent({ sizeShares: 100 }), book);

      const expectedFeeUsdc = 100 * 0.03 * 0.30 * 0.70; // 0.63
      assert.ok(Math.abs(fill.takerFee - expectedFeeUsdc) < FEE_TOLERANCE,
        `takerFee ${fill.takerFee} should be ${expectedFeeUsdc}`);

      // Buy fee in shares: 0.63 / 0.30 = 2.10
      const expectedFeeShares = expectedFeeUsdc / 0.30;
      assert.ok(Math.abs(fill.feeShares - expectedFeeShares) < FEE_TOLERANCE,
        `feeShares ${fill.feeShares} should be ${expectedFeeShares}`);
    });

    it('BUY at p=0.70: fee_usdc = 100 * 0.03 * 0.70 * 0.30 = $0.63', () => {
      const book = makeBook([[0.69, 1000]], [[0.70, 1000]]);
      const fill = engine.tryFill(makeIntent({ sizeShares: 100 }), book);

      const expectedFeeUsdc = 100 * 0.03 * 0.70 * 0.30; // 0.63
      assert.ok(Math.abs(fill.takerFee - expectedFeeUsdc) < FEE_TOLERANCE,
        `takerFee ${fill.takerFee} should be ${expectedFeeUsdc}`);

      // Buy fee in shares: 0.63 / 0.70 = 0.90
      const expectedFeeShares = expectedFeeUsdc / 0.70;
      assert.ok(Math.abs(fill.feeShares - expectedFeeShares) < FEE_TOLERANCE,
        `feeShares ${fill.feeShares} should be ${expectedFeeShares}`);
    });

    it('fee is IDENTICAL at p=0.30 and p=0.70 (symmetry)', () => {
      const book30 = makeBook([[0.29, 1000]], [[0.30, 1000]]);
      const book70 = makeBook([[0.69, 1000]], [[0.70, 1000]]);

      const fill30 = engine.tryFill(makeIntent({ sizeShares: 100 }), book30);
      const fill70 = engine.tryFill(makeIntent({ sizeShares: 100 }), book70);

      assert.ok(Math.abs(fill30.takerFee - fill70.takerFee) < FEE_TOLERANCE,
        `fee at 0.30 ($${fill30.takerFee}) should equal fee at 0.70 ($${fill70.takerFee})`);
    });
  });

  describe('fee maximized at p=0.50', () => {
    const engine = new OrderbookFillEngine(makeConfig(0.05));

    it('fee at 0.50 > fee at 0.30 > fee at 0.10', () => {
      const book10 = makeBook([[0.09, 1000]], [[0.10, 1000]]);
      const book30 = makeBook([[0.29, 1000]], [[0.30, 1000]]);
      const book50 = makeBook([[0.49, 1000]], [[0.50, 1000]]);

      const fill10 = engine.tryFill(makeIntent({ sizeShares: 100 }), book10);
      const fill30 = engine.tryFill(makeIntent({ sizeShares: 100 }), book30);
      const fill50 = engine.tryFill(makeIntent({ sizeShares: 100 }), book50);

      assert.ok(fill50.takerFee > fill30.takerFee, `fee@0.50 ($${fill50.takerFee}) > fee@0.30 ($${fill30.takerFee})`);
      assert.ok(fill30.takerFee > fill10.takerFee, `fee@0.30 ($${fill30.takerFee}) > fee@0.10 ($${fill10.takerFee})`);
    });
  });

  describe('Geopolitics (feeRate=0, free)', () => {
    const engine = new OrderbookFillEngine(makeConfig(0));

    it('zero fee on free markets', () => {
      const book = makeBook([[0.49, 1000]], [[0.50, 1000]]);
      const fill = engine.tryFill(makeIntent({ sizeShares: 100 }), book);

      assert.equal(fill.takerFee, 0);
      assert.equal(fill.feeShares, 0);
      assert.equal(fill.feeRate, 0);
    });
  });

  describe('per-token fee rate override', () => {
    it('uses token-specific rate instead of default', () => {
      const config: PaperConfig = {
        ...PAPER_DEFAULTS,
        defaultFeeRate: 0.05,
        feeRateOverrides: new Map([['sports-token', 0.03]]),
      };
      const engine = new OrderbookFillEngine(config);

      const book = makeBook([[0.49, 1000]], [[0.50, 1000]], 'sports-token');
      const fill = engine.tryFill(
        makeIntent({ tokenId: 'sports-token', sizeShares: 100 }),
        book,
      );

      assert.equal(fill.feeRate, 0.03);
      const expectedFee = 100 * 0.03 * 0.50 * 0.50; // 0.75, not 1.25
      assert.ok(Math.abs(fill.takerFee - expectedFee) < FEE_TOLERANCE);
    });
  });

  describe('cross-check against official table values', () => {
    // From docs.polymarket.com/trading/fees — Crypto table at key price points
    const engine = new OrderbookFillEngine(makeConfig(0.072));

    it('Crypto 100sh @ $0.01: fee = $0.07', () => {
      const book = makeBook([[0.005, 1000]], [[0.01, 1000]]);
      const fill = engine.tryFill(makeIntent({ sizeShares: 100 }), book);
      // 100 * 0.072 * 0.01 * 0.99 = 0.07128 → rounds to 0.07
      assert.ok(Math.abs(fill.takerFee - 0.07128) < FEE_TOLERANCE);
    });

    it('Crypto 100sh @ $0.10: fee = $0.65', () => {
      const book = makeBook([[0.09, 1000]], [[0.10, 1000]]);
      const fill = engine.tryFill(makeIntent({ sizeShares: 100 }), book);
      // 100 * 0.072 * 0.10 * 0.90 = 0.648
      assert.ok(Math.abs(fill.takerFee - 0.648) < FEE_TOLERANCE);
    });

    it('Crypto 100sh @ $0.50: fee = $1.80', () => {
      const book = makeBook([[0.49, 1000]], [[0.50, 1000]]);
      const fill = engine.tryFill(makeIntent({ sizeShares: 100 }), book);
      assert.ok(Math.abs(fill.takerFee - 1.80) < FEE_TOLERANCE);
    });

    it('Crypto 100sh @ $0.90: fee = $0.65', () => {
      const book = makeBook([[0.89, 1000]], [[0.90, 1000]]);
      const fill = engine.tryFill(makeIntent({ sizeShares: 100 }), book);
      // 100 * 0.072 * 0.90 * 0.10 = 0.648
      assert.ok(Math.abs(fill.takerFee - 0.648) < FEE_TOLERANCE);
    });
  });
});
