import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DefaultPaperExecutor } from '../../src/polybot/paper/executor.js';
import { OrderbookFillEngine } from '../../src/polybot/paper/fill-engine.js';
import { InMemoryPortfolio } from '../../src/polybot/paper/portfolio.js';
import type { OrderbookSnapshot, BookLevel } from '../../src/polybot/models/orderbook.js';
import type { OrderbookProvider } from '../../src/polybot/paper/types.js';
import type { OrderIntent, FillResult, PaperConfig } from '../../src/polybot/paper/models.js';
import { PAPER_DEFAULTS } from '../../src/polybot/paper/models.js';

function makeBook(
  bids: [number, number][],
  asks: [number, number][],
  tokenId = 'token-a',
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
    id: 'intent-1',
    tokenId: 'token-a',
    side: 'buy',
    sizeShares: 10,
    orderType: 'FAK',
    signalSource: 'test',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

const config: PaperConfig = { ...PAPER_DEFAULTS };

function makeExecutor(books: Map<string, OrderbookSnapshot> = new Map()): {
  executor: DefaultPaperExecutor;
  portfolio: InMemoryPortfolio;
  fills: Array<{ intent: OrderIntent; fill: FillResult }>;
} {
  const portfolio = new InMemoryPortfolio(config);
  const fillEngine = new OrderbookFillEngine(config);
  const provider: OrderbookProvider = {
    getLatestBook: (tokenId: string) => books.get(tokenId),
  };
  const fills: Array<{ intent: OrderIntent; fill: FillResult }> = [];
  const executor = new DefaultPaperExecutor(
    fillEngine,
    portfolio,
    provider,
    config,
    (intent, fill) => fills.push({ intent, fill }),
  );
  return { executor, portfolio, fills };
}

describe('DefaultPaperExecutor', () => {
  describe('end-to-end pipeline', () => {
    it('buy intent → fill → portfolio update', () => {
      const books = new Map([
        ['token-a', makeBook([[0.49, 100]], [[0.51, 100]])],
      ]);
      const { executor, portfolio, fills } = makeExecutor(books);

      const fill = executor.execute(makeIntent({ sizeShares: 10 }));

      assert.equal(fill.status, 'filled');
      assert.equal(fill.filledSize, 10);

      // Portfolio updated
      assert.ok(portfolio.cashBalance < 1000);
      const pos = portfolio.getPosition('token-a');
      assert.ok(pos);
      assert.equal(pos.shares, 10);

      // Fill recorded via callback
      assert.equal(fills.length, 1);
      assert.equal(fills[0].fill.status, 'filled');
    });

    it('buy then sell → realizes P&L', () => {
      const books = new Map([
        ['token-a', makeBook([[0.49, 100], [0.55, 100]], [[0.51, 100], [0.60, 100]])],
      ]);
      const { executor, portfolio } = makeExecutor(books);

      // Buy 10 @ 0.51
      executor.execute(makeIntent({ id: 'b1', sizeShares: 10 }));

      // Sell 10 @ best bid 0.55 (but book has 0.49 first in descending order)
      // Wait - bids are [[0.49, 100], [0.55, 100]]. But bids should be sorted descending.
      // Let me fix: bids: [[0.55, 100], [0.49, 100]]
      // Actually makeBook sorts them. Let me re-create:

      const sellBooks = new Map([
        ['token-a', makeBook([[0.55, 100], [0.49, 100]], [[0.60, 100]])],
      ]);

      // Re-create executor with new books for sell
      const portfolio2 = new InMemoryPortfolio(config);
      const fillEngine2 = new OrderbookFillEngine(config);
      const provider2: OrderbookProvider = {
        getLatestBook: (tokenId: string) => sellBooks.get(tokenId),
      };
      const executor2 = new DefaultPaperExecutor(fillEngine2, portfolio2, provider2, config);

      // Buy at 0.60 (only ask available)
      executor2.execute(makeIntent({ id: 'b1', sizeShares: 10 }));
      // Sell at 0.55 (best bid)
      executor2.execute(makeIntent({ id: 's1', side: 'sell', sizeShares: 10 }));

      // Position should be closed
      assert.equal(portfolio2.getPosition('token-a'), undefined);
      // Realized loss: (0.55 - 0.60) * 10 - sellFee
      const stats = portfolio2.getSessionStats();
      assert.ok(stats.realizedPnl < 0, 'should have a realized loss');
      assert.equal(stats.totalTrades, 2);
    });
  });

  describe('validation', () => {
    it('rejects when no orderbook available', () => {
      const { executor, fills } = makeExecutor(new Map());
      const fill = executor.execute(makeIntent());

      assert.equal(fill.status, 'rejected');
      assert.ok(fill.rejectReason?.includes('no_orderbook'));
      assert.equal(fills.length, 1); // rejection is also recorded
    });

    it('rejects when no size specified', () => {
      const books = new Map([
        ['token-a', makeBook([[0.49, 100]], [[0.51, 100]])],
      ]);
      const { executor } = makeExecutor(books);
      const fill = executor.execute(makeIntent({ sizeShares: undefined, notionalUsdc: undefined }));

      assert.equal(fill.status, 'rejected');
      assert.ok(fill.rejectReason?.includes('no_size'));
    });

    it('rejects sell without position', () => {
      const books = new Map([
        ['token-a', makeBook([[0.49, 100]], [[0.51, 100]])],
      ]);
      const { executor } = makeExecutor(books);
      const fill = executor.execute(makeIntent({ side: 'sell' }));

      assert.equal(fill.status, 'rejected');
      assert.ok(fill.rejectReason?.includes('no_position_to_sell'));
    });

    it('rejects when exceeding max position size', () => {
      const books = new Map([
        ['token-a', makeBook([[0.49, 1000]], [[0.51, 1000]])],
      ]);
      const { executor } = makeExecutor(books);
      // 500 shares @ 0.51 = $255, which exceeds default $100 max position
      const fill = executor.execute(makeIntent({ sizeShares: 500 }));

      assert.equal(fill.status, 'rejected');
      assert.ok(fill.rejectReason?.includes('exceeds_max_position_size'));
    });

    it('rejects when max open positions reached', () => {
      const books = new Map([
        ['token-a', makeBook([[0.49, 100]], [[0.51, 100]])],
        ['token-b', makeBook([[0.49, 100]], [[0.51, 100]], 'token-b')],
        ['token-c', makeBook([[0.49, 100]], [[0.51, 100]], 'token-c')],
        ['token-d', makeBook([[0.49, 100]], [[0.51, 100]], 'token-d')],
        ['token-e', makeBook([[0.49, 100]], [[0.51, 100]], 'token-e')],
        ['token-f', makeBook([[0.49, 100]], [[0.51, 100]], 'token-f')],
      ]);
      const customConfig: PaperConfig = { ...config, maxOpenPositions: 3, maxPositionSizeUsdc: 200 };
      const portfolio = new InMemoryPortfolio(customConfig);
      const fillEngine = new OrderbookFillEngine(customConfig);
      const provider: OrderbookProvider = { getLatestBook: (id) => books.get(id) };
      const executor = new DefaultPaperExecutor(fillEngine, portfolio, provider, customConfig);

      // Open 3 positions
      executor.execute(makeIntent({ id: 'b1', tokenId: 'token-a', sizeShares: 10 }));
      executor.execute(makeIntent({ id: 'b2', tokenId: 'token-b', sizeShares: 10 }));
      executor.execute(makeIntent({ id: 'b3', tokenId: 'token-c', sizeShares: 10 }));

      // 4th should be rejected
      const fill = executor.execute(makeIntent({ id: 'b4', tokenId: 'token-d', sizeShares: 10 }));
      assert.equal(fill.status, 'rejected');
      assert.ok(fill.rejectReason?.includes('max_positions_reached'));
    });
  });

  describe('deterministic replay', () => {
    it('same inputs produce identical results', () => {
      const book = makeBook([[0.49, 50]], [[0.51, 20], [0.52, 30]]);

      const intents: OrderIntent[] = [
        makeIntent({ id: 'i1', sizeShares: 15 }),
        makeIntent({ id: 'i2', sizeShares: 5 }),
      ];

      // Run 1
      const books1 = new Map([['token-a', book]]);
      const { executor: exec1 } = makeExecutor(books1);
      const results1 = intents.map(i => exec1.execute(i));

      // Run 2 (identical inputs, fresh executor)
      const books2 = new Map([['token-a', book]]);
      const { executor: exec2 } = makeExecutor(books2);
      const results2 = intents.map(i => exec2.execute(i));

      // Compare results
      for (let i = 0; i < results1.length; i++) {
        assert.equal(results1[i].status, results2[i].status);
        assert.equal(results1[i].filledSize, results2[i].filledSize);
        assert.ok(Math.abs(results1[i].effectivePrice - results2[i].effectivePrice) < 1e-10);
        assert.ok(Math.abs(results1[i].grossAmount - results2[i].grossAmount) < 1e-10);
        assert.ok(Math.abs(results1[i].takerFee - results2[i].takerFee) < 1e-10);
      }

      // Compare final portfolio states
      const stats1 = exec1.portfolio.getSessionStats();
      const stats2 = exec2.portfolio.getSessionStats();
      assert.equal(stats1.totalTrades, stats2.totalTrades);
      assert.ok(Math.abs(stats1.netPnl - stats2.netPnl) < 1e-10);
    });
  });
});
