/**
 * In-memory virtual portfolio for paper trading.
 *
 * Tracks:
 * - Cash balance (available USDC)
 * - Open positions per tokenId (shares, avg entry, cost basis, P&L)
 * - Trade history
 * - Session statistics (win rate, gross/net P&L, slippage, per-market/source)
 *
 * Session-scoped: starts fresh, no persistence across sessions.
 */

import type { VirtualPortfolio } from './types.js';
import type {
  OrderIntent,
  FillResult,
  Position,
  PaperTrade,
  SessionStats,
  MarketStats,
  SignalSourceStats,
  PaperConfig,
} from './models.js';

export class InMemoryPortfolio implements VirtualPortfolio {
  private _cashBalance: number;
  private _initialBalance: number;
  private positions = new Map<string, Position>();
  private trades: PaperTrade[] = [];

  constructor(config: PaperConfig) {
    this._cashBalance = config.initialBalanceUsdc;
    this._initialBalance = config.initialBalanceUsdc;
  }

  get cashBalance(): number {
    return this._cashBalance;
  }

  get initialBalance(): number {
    return this._initialBalance;
  }

  getPositions(): Position[] {
    return [...this.positions.values()].filter(p => p.shares > 1e-10);
  }

  getPosition(tokenId: string): Position | undefined {
    const pos = this.positions.get(tokenId);
    return pos && pos.shares > 1e-10 ? pos : undefined;
  }

  applyFill(intent: OrderIntent, fill: FillResult): void {
    if (fill.status === 'rejected' || fill.filledSize < 1e-10) return;

    if (fill.side === 'buy') {
      this.applyBuy(intent, fill);
    } else {
      this.applySell(intent, fill);
    }

    // Record trade
    this.trades.push({
      intentId: fill.intentId,
      tokenId: intent.tokenId,
      side: fill.side,
      filledSize: fill.filledSize,
      effectivePrice: fill.effectivePrice,
      grossAmount: fill.grossAmount,
      takerFee: fill.takerFee,
      slippageBps: fill.slippageBps,
      signalSource: intent.signalSource,
      filledAt: fill.filledAt,
    });
  }

  markToMarket(prices: Map<string, number>): void {
    for (const [tokenId, pos] of this.positions) {
      const price = prices.get(tokenId);
      if (price !== undefined) {
        pos.currentPrice = price;
        pos.unrealizedPnl = pos.shares > 1e-10
          ? (price - pos.avgEntryPrice) * pos.shares
          : 0;
      }
    }
  }

  getTradeHistory(): PaperTrade[] {
    return [...this.trades];
  }

  getSessionStats(): SessionStats {
    // Compute realized P&L per token from closed/reduced positions
    const realizedByToken = new Map<string, number>();
    const feesByToken = new Map<string, number>();
    const slippageValues: number[] = [];

    for (const pos of this.positions.values()) {
      realizedByToken.set(pos.tokenId, pos.realizedPnl);
      feesByToken.set(pos.tokenId, pos.totalFees);
    }

    // Per-trade slippage
    for (const t of this.trades) {
      slippageValues.push(t.slippageBps);
    }

    // Compute wins/losses from closed sells (realized trades)
    const sellTrades = this.trades.filter(t => t.side === 'sell');
    let wins = 0;
    let losses = 0;
    for (const sell of sellTrades) {
      // Get the position's avg entry at time of sell
      // Approximate: compare sell price to the position's current avgEntryPrice
      const pos = this.positions.get(sell.tokenId);
      if (pos) {
        // A sell at effectivePrice > avgEntryPrice is a win
        if (sell.effectivePrice > pos.avgEntryPrice) {
          wins++;
        } else {
          losses++;
        }
      }
    }

    // If no sells yet, use unrealized direction
    if (sellTrades.length === 0) {
      for (const pos of this.positions.values()) {
        if (pos.shares < 1e-10) continue;
        if (pos.unrealizedPnl > 0) wins++;
        else if (pos.unrealizedPnl < 0) losses++;
      }
    }

    const totalRealizedPnl = [...this.positions.values()].reduce((s, p) => s + p.realizedPnl, 0);
    const totalUnrealizedPnl = [...this.positions.values()].reduce((s, p) => s + p.unrealizedPnl, 0);
    const totalFees = [...this.positions.values()].reduce((s, p) => s + p.totalFees, 0);
    const grossPnl = totalRealizedPnl + totalUnrealizedPnl + totalFees; // add back fees for gross
    const netPnl = totalRealizedPnl + totalUnrealizedPnl;
    const totalTrades = this.trades.length;
    const totalDecisions = wins + losses;
    const avgSlippage = slippageValues.length > 0
      ? slippageValues.reduce((s, v) => s + v, 0) / slippageValues.length
      : 0;

    return {
      totalTrades,
      wins,
      losses,
      winRate: totalDecisions > 0 ? wins / totalDecisions : 0,
      grossPnl,
      totalFees,
      netPnl,
      avgSlippageBps: avgSlippage,
      realizedPnl: totalRealizedPnl,
      unrealizedPnl: totalUnrealizedPnl,
      byMarket: this.computeMarketStats(),
      bySignalSource: this.computeSignalSourceStats(),
    };
  }

  /** Check if a buy of the given USDC amount is affordable. */
  canAfford(totalCostUsdc: number): boolean {
    return this._cashBalance >= totalCostUsdc;
  }

  /** Number of distinct open positions. */
  get openPositionCount(): number {
    return [...this.positions.values()].filter(p => p.shares > 1e-10).length;
  }

  private applyBuy(intent: OrderIntent, fill: FillResult): void {
    const totalDebit = fill.grossAmount + fill.takerFee;
    this._cashBalance -= totalDebit;

    const existing = this.positions.get(intent.tokenId);
    if (existing && existing.shares > 1e-10) {
      // Add to existing position — weighted average entry
      const newTotalCost = existing.totalCost + fill.grossAmount;
      const newShares = existing.shares + fill.filledSize;
      existing.shares = newShares;
      existing.avgEntryPrice = newTotalCost / newShares;
      existing.totalCost = newTotalCost;
      existing.totalFees += fill.takerFee;
    } else {
      // New position
      this.positions.set(intent.tokenId, {
        tokenId: intent.tokenId,
        shares: fill.filledSize,
        avgEntryPrice: fill.effectivePrice,
        totalCost: fill.grossAmount,
        currentPrice: fill.effectivePrice,
        unrealizedPnl: 0,
        realizedPnl: 0,
        totalFees: fill.takerFee,
      });
    }
  }

  private applySell(intent: OrderIntent, fill: FillResult): void {
    const existing = this.positions.get(intent.tokenId);
    if (!existing || existing.shares < 1e-10) return; // nothing to sell

    const sellShares = Math.min(fill.filledSize, existing.shares);
    const sellProceeds = fill.effectivePrice * sellShares;
    const costBasis = existing.avgEntryPrice * sellShares;
    const realizedPnl = sellProceeds - costBasis - fill.takerFee;

    // Credit cash
    this._cashBalance += sellProceeds - fill.takerFee;

    // Update position
    existing.realizedPnl += realizedPnl;
    existing.totalFees += fill.takerFee;
    existing.shares -= sellShares;
    existing.totalCost -= costBasis;

    // If fully closed, keep the record for stats but with 0 shares
    if (existing.shares < 1e-10) {
      existing.shares = 0;
      existing.totalCost = 0;
      existing.unrealizedPnl = 0;
    }
  }

  private computeMarketStats(): MarketStats[] {
    const byMarket = new Map<string, { trades: number; grossPnl: number; fees: number; slippages: number[] }>();

    for (const trade of this.trades) {
      const entry = byMarket.get(trade.tokenId) ?? { trades: 0, grossPnl: 0, fees: 0, slippages: [] };
      entry.trades++;
      entry.fees += trade.takerFee;
      entry.slippages.push(trade.slippageBps);
      byMarket.set(trade.tokenId, entry);
    }

    const result: MarketStats[] = [];
    for (const [tokenId, data] of byMarket) {
      const pos = this.positions.get(tokenId);
      const pnl = pos ? pos.realizedPnl + pos.unrealizedPnl : 0;
      result.push({
        tokenId,
        trades: data.trades,
        grossPnl: pnl + data.fees, // add back fees for gross
        netPnl: pnl,
        totalFees: data.fees,
        avgSlippageBps: data.slippages.length > 0
          ? data.slippages.reduce((s, v) => s + v, 0) / data.slippages.length
          : 0,
      });
    }
    return result;
  }

  private computeSignalSourceStats(): SignalSourceStats[] {
    const bySource = new Map<string, { trades: number; fees: number; tokenIds: Set<string> }>();

    for (const trade of this.trades) {
      const entry = bySource.get(trade.signalSource) ?? { trades: 0, fees: 0, tokenIds: new Set() };
      entry.trades++;
      entry.fees += trade.takerFee;
      entry.tokenIds.add(trade.tokenId);
      bySource.set(trade.signalSource, entry);
    }

    const result: SignalSourceStats[] = [];
    for (const [source, data] of bySource) {
      // Sum P&L from all tokens this source traded
      let totalPnl = 0;
      for (const tokenId of data.tokenIds) {
        const pos = this.positions.get(tokenId);
        if (pos) totalPnl += pos.realizedPnl + pos.unrealizedPnl;
      }
      result.push({
        source,
        trades: data.trades,
        grossPnl: totalPnl + data.fees,
        netPnl: totalPnl,
        totalFees: data.fees,
      });
    }
    return result;
  }
}
