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

function makeFill(side: 'buy' | 'sell', size: number, price: number, overrides: Partial<FillResult> = {}): FillResult {
  const p = price;
  const feeRate = 0.05; // default decimal fee rate
  // Official Polymarket formula: fee = C × feeRate × p × (1-p)
  const takerFeeUsdc = size * feeRate * p * (1 - p);
  const feeShares = side === 'buy' ? takerFeeUsdc / p : 0;
  const takerFee = takerFeeUsdc;

  return {
    intentId: 'test-1',
    side,
    status: 'filled',
    filledSize: size,
    remainderSize: 0,
    effectivePrice: price,
    slippageBps: 100,
    grossAmount: size * price,
    takerFee,
    feeShares,
    feeRate,
    levels: [{ price, size, usdcAmount: size * price }],
    filledAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('InMemoryPortfolio', () => {
  describe('buy fills', () => {
    it('updates cash, position, and avg cost after buy (fee in shares)', () => {
      const portfolio = new InMemoryPortfolio(config);
      const intent = makeIntent();
      const fill = makeFill('buy', 10, 0.50);

      portfolio.applyFill(intent, fill);

      // p=0.50, fee_usdc = 10 * 0.05 * 0.50 * 0.50 = 0.125
      // feeShares = 0.125 / 0.50 = 0.25
      // Cash debit = grossAmount only = 5.00 (buy fee is in shares, NOT USDC)
      assert.ok(Math.abs(portfolio.cashBalance - 995.00) < 1e-10);

      const pos = portfolio.getPosition('token-a');
      assert.ok(pos);
      // Net shares = 10 - 0.25 = 9.75
      const expectedFeeShares = 10 * 0.05 * 0.50 * 0.50 / 0.50; // 0.25
      assert.ok(Math.abs(pos.shares - (10 - expectedFeeShares)) < 1e-10);
      // avgEntryPrice = grossAmount / netShares = 5.00 / 9.75
      assert.ok(Math.abs(pos.avgEntryPrice - 5.00 / (10 - expectedFeeShares)) < 1e-10);
      assert.ok(Math.abs(pos.totalCost - 5.00) < 1e-10);
      // takerFee = 10 * 0.05 * 0.50 * 0.50 = 0.125
      assert.ok(Math.abs(pos.totalFees - 0.125) < 1e-10);
    });

    it('updates avg entry price on additional buy', () => {
      const portfolio = new InMemoryPortfolio(config);

      // First buy: 10 @ 0.50
      portfolio.applyFill(
        makeIntent({ id: 'b1' }),
        makeFill('buy', 10, 0.50),
      );
      // Second buy: 10 @ 0.60
      portfolio.applyFill(
        makeIntent({ id: 'b2' }),
        makeFill('buy', 10, 0.60),
      );

      const pos = portfolio.getPosition('token-a');
      assert.ok(pos);

      // p=0.50: fee_usdc1 = 10*0.05*0.50*0.50=0.125, feeShares1 = 0.125/0.50=0.25, net1=9.75
      // p=0.60: fee_usdc2 = 10*0.05*0.60*0.40=0.12, feeShares2 = 0.12/0.60=0.20, net2=9.80
      const net1 = 10 - (10 * 0.05 * 0.50 * 0.50) / 0.50;
      const net2 = 10 - (10 * 0.05 * 0.60 * 0.40) / 0.60;
      assert.ok(Math.abs(pos.shares - (net1 + net2)) < 1e-8);

      // avgEntry = (5.00 + 6.00) / (net1 + net2)
      const expectedAvg = 11.00 / (net1 + net2);
      assert.ok(Math.abs(pos.avgEntryPrice - expectedAvg) < 1e-8);

      // Cash: 1000 - 5.00 - 6.00 = 989.00 (no USDC fee on buys)
      assert.ok(Math.abs(portfolio.cashBalance - 989.00) < 1e-10);
    });
  });

  describe('sell fills', () => {
    it('realizes P&L on sell', () => {
      const portfolio = new InMemoryPortfolio(config);

      // Buy 10 @ 0.50
      const buyFill = makeFill('buy', 10, 0.50);
      portfolio.applyFill(makeIntent({ id: 'b1' }), buyFill);

      // Net shares from buy: 10 - feeShares(0.25) = 9.75
      const netBuyShares = 10 - buyFill.feeShares;

      // Sell all net shares @ 0.60
      const sellFill = makeFill('sell', netBuyShares, 0.60);
      portfolio.applyFill(
        makeIntent({ id: 's1', side: 'sell', sizeShares: netBuyShares }),
        sellFill,
      );

      const pos = portfolio.getPosition('token-a');
      assert.equal(pos, undefined);

      // Cash: 1000 - 5.00 (buy) + (netBuyShares * 0.60 - sellFee)
      // sellFee: netBuyShares * 0.05 * 0.60 * 0.40
      const sellProceeds = netBuyShares * 0.60 - sellFill.takerFee;
      assert.ok(Math.abs(portfolio.cashBalance - (995.00 + sellProceeds)) < 1e-8);
    });

    it('partial sell reduces position correctly', () => {
      const portfolio = new InMemoryPortfolio(config);

      // Buy 20 @ 0.50
      const buyFill = makeFill('buy', 20, 0.50);
      portfolio.applyFill(makeIntent({ sizeShares: 20 }), buyFill);

      const netBuyShares = 20 - buyFill.feeShares; // 20 - 0.50 = 19.50
      const avgEntry = 10.00 / netBuyShares; // grossAmount / netShares

      // Sell 10 shares @ 0.60
      const sellFill = makeFill('sell', 10, 0.60);
      portfolio.applyFill(
        makeIntent({ side: 'sell', sizeShares: 10 }),
        sellFill,
      );

      const pos = portfolio.getPosition('token-a');
      assert.ok(pos);
      assert.ok(Math.abs(pos.shares - (netBuyShares - 10)) < 1e-10);
      assert.ok(Math.abs(pos.avgEntryPrice - avgEntry) < 1e-8);

      // Realized PnL on partial: (0.60 - avgEntry) * 10 - sellFee
      const expectedPnl = (0.60 - avgEntry) * 10 - sellFill.takerFee;
      assert.ok(Math.abs(pos.realizedPnl - expectedPnl) < 1e-8);
    });
  });

  describe('markToMarket', () => {
    it('updates unrealized P&L from current prices', () => {
      const portfolio = new InMemoryPortfolio(config);

      const fill = makeFill('buy', 10, 0.50);
      portfolio.applyFill(makeIntent(), fill);

      const netShares = 10 - fill.feeShares; // 9.80
      const avgEntry = 5.00 / netShares;

      portfolio.markToMarket(new Map([['token-a', 0.70]]));

      const pos = portfolio.getPosition('token-a');
      assert.ok(pos);
      assert.equal(pos.currentPrice, 0.70);
      // Unrealized: (0.70 - avgEntry) * netShares
      const expectedUnrealized = (0.70 - avgEntry) * netShares;
      assert.ok(Math.abs(pos.unrealizedPnl - expectedUnrealized) < 1e-8);
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
        makeFill('buy', 10, 0.50),
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
    it('gross = net + fees, fees tracked correctly', () => {
      const portfolio = new InMemoryPortfolio(config);

      // Buy 10 @ 0.50
      const buyFill = makeFill('buy', 10, 0.50);
      portfolio.applyFill(makeIntent({ id: 'b1' }), buyFill);

      const netBuyShares = 10 - buyFill.feeShares; // 9.80
      const avgEntry = 5.00 / netBuyShares;

      // Sell all net shares @ 0.60
      const sellFill = makeFill('sell', netBuyShares, 0.60);
      portfolio.applyFill(
        makeIntent({ id: 's1', side: 'sell', sizeShares: netBuyShares }),
        sellFill,
      );

      const stats = portfolio.getSessionStats();

      // Total fees = buy USDC-equiv + sell USDC fee
      const expectedTotalFees = buyFill.takerFee + sellFill.takerFee;
      assert.ok(Math.abs(stats.totalFees - expectedTotalFees) < 1e-8);

      // Realized PnL = (sellPrice - avgEntry) * sellShares - sellFee
      const expectedRealizedPnl = (0.60 - avgEntry) * netBuyShares - sellFill.takerFee;
      assert.ok(Math.abs(stats.realizedPnl - expectedRealizedPnl) < 1e-8);

      // Gross = net + fees
      assert.ok(Math.abs(stats.grossPnl - (stats.netPnl + stats.totalFees)) < 1e-8);
    });
  });

  describe('trade history', () => {
    it('returns trades in chronological order', () => {
      const portfolio = new InMemoryPortfolio(config);

      portfolio.applyFill(
        makeIntent({ id: 'b1' }),
        makeFill('buy', 10, 0.50),
      );
      portfolio.applyFill(
        makeIntent({ id: 'b2', tokenId: 'token-b' }),
        makeFill('buy', 5, 0.30),
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
        feeShares: 0,
        feeRate: 0,
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
