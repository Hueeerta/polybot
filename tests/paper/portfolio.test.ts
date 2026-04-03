import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryPortfolio } from '../../src/polybot/paper/portfolio.js';
import type { OrderIntent, FillResult, PaperConfig } from '../../src/polybot/paper/models.js';
import { PAPER_DEFAULTS } from '../../src/polybot/paper/models.js';

const config: PaperConfig = { ...PAPER_DEFAULTS, initialBalanceUsdc: 1000 };

function makeIntent(overrides: Partial<OrderIntent> = {}): OrderIntent {
  return {
    id: 'test-1',
    tokenId: 'token-a',
    side: 'buy',
    sizeShares: 10,
    orderType: 'FAK',
    signalSource: 'test',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeFill(side: 'buy' | 'sell', size: number, price: number, fee: number): FillResult {
  return {
    intentId: 'test-1',
    side,
    status: 'filled',
    filledSize: size,
    remainderSize: 0,
    effectivePrice: price,
    slippageBps: 100,
    grossAmount: size * price,
    takerFee: fee,
    levels: [{ price, size, usdcAmount: size * price }],
    filledAt: new Date().toISOString(),
  };
}

describe('InMemoryPortfolio', () => {
  describe('buy fills', () => {
    it('updates cash, position, and avg cost after buy', () => {
      const portfolio = new InMemoryPortfolio(config);
      const intent = makeIntent();
      const fill = makeFill('buy', 10, 0.50, 0.10);

      portfolio.applyFill(intent, fill);

      // Cash: 1000 - (5.00 + 0.10) = 994.90
      assert.ok(Math.abs(portfolio.cashBalance - 994.90) < 1e-10);

      const pos = portfolio.getPosition('token-a');
      assert.ok(pos);
      assert.equal(pos.shares, 10);
      assert.equal(pos.avgEntryPrice, 0.50);
      assert.ok(Math.abs(pos.totalCost - 5.00) < 1e-10);
      assert.ok(Math.abs(pos.totalFees - 0.10) < 1e-10);
    });

    it('updates avg entry price on additional buy', () => {
      const portfolio = new InMemoryPortfolio(config);

      // First buy: 10 @ 0.50
      portfolio.applyFill(
        makeIntent({ id: 'b1' }),
        makeFill('buy', 10, 0.50, 0.10),
      );
      // Second buy: 10 @ 0.60
      portfolio.applyFill(
        makeIntent({ id: 'b2' }),
        makeFill('buy', 10, 0.60, 0.12),
      );

      const pos = portfolio.getPosition('token-a');
      assert.ok(pos);
      assert.equal(pos.shares, 20);
      // avgEntry = (10*0.50 + 10*0.60) / 20 = 11.00 / 20 = 0.55
      assert.ok(Math.abs(pos.avgEntryPrice - 0.55) < 1e-10);
      // Cash: 1000 - (5.00+0.10) - (6.00+0.12) = 988.78
      assert.ok(Math.abs(portfolio.cashBalance - 988.78) < 1e-10);
    });
  });

  describe('sell fills', () => {
    it('realizes P&L on sell', () => {
      const portfolio = new InMemoryPortfolio(config);

      // Buy 10 @ 0.50
      portfolio.applyFill(
        makeIntent({ id: 'b1' }),
        makeFill('buy', 10, 0.50, 0.10),
      );
      // Sell 10 @ 0.60
      portfolio.applyFill(
        makeIntent({ id: 's1', side: 'sell' }),
        makeFill('sell', 10, 0.60, 0.12),
      );

      const pos = portfolio.getPosition('token-a');
      // Position should be closed (shares = 0)
      assert.equal(pos, undefined);

      // Cash: 1000 - (5.00+0.10) + (6.00-0.12) = 1000.78
      assert.ok(Math.abs(portfolio.cashBalance - 1000.78) < 1e-10);
    });

    it('partial sell reduces position correctly', () => {
      const portfolio = new InMemoryPortfolio(config);

      // Buy 20 @ 0.50
      portfolio.applyFill(
        makeIntent({ sizeShares: 20 }),
        makeFill('buy', 20, 0.50, 0.20),
      );
      // Sell 10 @ 0.60
      portfolio.applyFill(
        makeIntent({ side: 'sell', sizeShares: 10 }),
        makeFill('sell', 10, 0.60, 0.12),
      );

      const pos = portfolio.getPosition('token-a');
      assert.ok(pos);
      assert.equal(pos.shares, 10);
      assert.ok(Math.abs(pos.avgEntryPrice - 0.50) < 1e-10);
      // Realized PnL on partial: (0.60 - 0.50) * 10 - 0.12 = 0.88
      assert.ok(Math.abs(pos.realizedPnl - 0.88) < 1e-10);
    });
  });

  describe('markToMarket', () => {
    it('updates unrealized P&L from current prices', () => {
      const portfolio = new InMemoryPortfolio(config);

      portfolio.applyFill(
        makeIntent(),
        makeFill('buy', 10, 0.50, 0.10),
      );

      portfolio.markToMarket(new Map([['token-a', 0.70]]));

      const pos = portfolio.getPosition('token-a');
      assert.ok(pos);
      assert.equal(pos.currentPrice, 0.70);
      // Unrealized: (0.70 - 0.50) * 10 = 2.00
      assert.ok(Math.abs(pos.unrealizedPnl - 2.00) < 1e-10);
    });
  });

  describe('session stats', () => {
    it('uses only current session data', () => {
      const portfolio = new InMemoryPortfolio(config);
      const stats = portfolio.getSessionStats();

      assert.equal(stats.totalTrades, 0);
      assert.equal(stats.wins, 0);
      assert.equal(stats.losses, 0);
      assert.equal(stats.winRate, 0);
      assert.equal(stats.grossPnl, 0);
      assert.equal(stats.netPnl, 0);
    });

    it('tracks trades, fees, and slippage', () => {
      const portfolio = new InMemoryPortfolio(config);

      portfolio.applyFill(
        makeIntent({ signalSource: 'signal-a' }),
        makeFill('buy', 10, 0.50, 0.10),
      );

      const stats = portfolio.getSessionStats();
      assert.equal(stats.totalTrades, 1);
      assert.ok(stats.totalFees > 0);
      assert.ok(stats.avgSlippageBps > 0);
      assert.equal(stats.bySignalSource.length, 1);
      assert.equal(stats.bySignalSource[0].source, 'signal-a');
    });
  });

  describe('net P&L deducts fees', () => {
    it('net P&L = realized + unrealized, gross = net + fees', () => {
      const portfolio = new InMemoryPortfolio(config);

      // Buy 10 @ 0.50, fee 0.10
      portfolio.applyFill(
        makeIntent({ id: 'b1' }),
        makeFill('buy', 10, 0.50, 0.10),
      );
      // Sell 10 @ 0.60, fee 0.12
      portfolio.applyFill(
        makeIntent({ id: 's1', side: 'sell' }),
        makeFill('sell', 10, 0.60, 0.12),
      );

      const stats = portfolio.getSessionStats();
      // Realized: (0.60 - 0.50) * 10 - 0.12 = 0.88
      // But the buy fee (0.10) is also tracked
      // Total fees: 0.10 + 0.12 = 0.22
      assert.ok(Math.abs(stats.totalFees - 0.22) < 1e-10);
      // Net PnL (realized): 0.88
      assert.ok(Math.abs(stats.realizedPnl - 0.88) < 1e-10);
      // Gross PnL = net + fees = 0.88 + 0.22 = 1.10
      assert.ok(Math.abs(stats.grossPnl - 1.10) < 1e-10);
    });
  });

  describe('trade history', () => {
    it('returns trades in chronological order', () => {
      const portfolio = new InMemoryPortfolio(config);

      portfolio.applyFill(
        makeIntent({ id: 'b1' }),
        makeFill('buy', 10, 0.50, 0.10),
      );
      portfolio.applyFill(
        makeIntent({ id: 'b2', tokenId: 'token-b' }),
        makeFill('buy', 5, 0.30, 0.03),
      );

      const history = portfolio.getTradeHistory();
      assert.equal(history.length, 2);
      assert.equal(history[0].intentId, 'test-1');
      assert.equal(history[1].tokenId, 'token-b');
    });
  });

  describe('rejected fills', () => {
    it('does not modify portfolio on rejected fill', () => {
      const portfolio = new InMemoryPortfolio(config);
      const intent = makeIntent();
      const fill: FillResult = {
        intentId: 'test-1',
        side: 'buy',
        status: 'rejected',
        filledSize: 0,
        remainderSize: 10,
        effectivePrice: 0,
        slippageBps: 0,
        grossAmount: 0,
        takerFee: 0,
        levels: [],
        filledAt: new Date().toISOString(),
        rejectReason: 'test_rejection',
      };

      portfolio.applyFill(intent, fill);

      assert.equal(portfolio.cashBalance, 1000);
      assert.equal(portfolio.getPositions().length, 0);
    });
  });
});
