/**
 * Paper executor — orchestrates the paper trading pipeline.
 *
 * Flow: OrderIntent → validate → query orderbook → fill → update portfolio.
 *
 * Zero network I/O. All state is local and session-scoped.
 */

import type { FillEngine, VirtualPortfolio, OrderbookProvider, PaperExecutor } from './types.js';
import type { OrderIntent, FillResult, PaperConfig } from './models.js';

export class DefaultPaperExecutor implements PaperExecutor {
  constructor(
    private fillEngine: FillEngine,
    private _portfolio: VirtualPortfolio,
    private orderbookProvider: OrderbookProvider,
    private config: PaperConfig,
    private onFill?: (intent: OrderIntent, fill: FillResult) => void,
  ) {}

  get portfolio(): VirtualPortfolio {
    return this._portfolio;
  }

  execute(intent: OrderIntent): FillResult {
    const now = new Date().toISOString();

    // Validate intent has a size
    if ((intent.sizeShares === undefined || intent.sizeShares <= 0) &&
        (intent.notionalUsdc === undefined || intent.notionalUsdc <= 0)) {
      return this.reject(intent, now, 'no_size: sizeShares or notionalUsdc required');
    }

    // Get current orderbook
    const book = this.orderbookProvider.getLatestBook(intent.tokenId);
    if (!book) {
      return this.reject(intent, now, `no_orderbook: no book for ${intent.tokenId}`);
    }

    // Pre-fill validation: check position limits
    if (intent.side === 'buy') {
      // Estimate cost for position limit check
      const estimatedPrice = book.bestAsk ?? book.midPrice ?? 0;
      const estimatedSize = intent.sizeShares ?? (intent.notionalUsdc ?? 0) / (estimatedPrice || 1);
      const estimatedCost = estimatedSize * estimatedPrice;

      // Check max position size
      if (estimatedCost > this.config.maxPositionSizeUsdc) {
        return this.reject(intent, now, `exceeds_max_position_size: ~$${estimatedCost.toFixed(2)} > $${this.config.maxPositionSizeUsdc}`);
      }

      // Check cash available
      const portfolio = this._portfolio as VirtualPortfolio & { canAfford?: (n: number) => boolean };
      if (typeof portfolio.canAfford === 'function' && !portfolio.canAfford(estimatedCost)) {
        return this.reject(intent, now, `insufficient_cash: ~$${estimatedCost.toFixed(2)} needed, $${this._portfolio.cashBalance.toFixed(2)} available`);
      }

      // Check max open positions
      const currentPositionCount = (portfolio as unknown as { openPositionCount?: number }).openPositionCount ?? 0;
      const existingPosition = this._portfolio.getPosition(intent.tokenId);
      if (!existingPosition && currentPositionCount >= this.config.maxOpenPositions) {
        return this.reject(intent, now, `max_positions_reached: ${currentPositionCount} >= ${this.config.maxOpenPositions}`);
      }
    } else {
      // Sell: check we have shares to sell
      const position = this._portfolio.getPosition(intent.tokenId);
      if (!position || position.shares < 1e-10) {
        return this.reject(intent, now, `no_position_to_sell: no shares of ${intent.tokenId}`);
      }
    }

    // Execute fill
    const fill = this.fillEngine.tryFill(intent, book);

    // Apply to portfolio if filled
    if (fill.status !== 'rejected') {
      this._portfolio.applyFill(intent, fill);
    }

    // Notify listener
    if (this.onFill) {
      this.onFill(intent, fill);
    }

    return fill;
  }

  private reject(intent: OrderIntent, filledAt: string, reason: string): FillResult {
    const fill: FillResult = {
      intentId: intent.id,
      side: intent.side,
      status: 'rejected',
      filledSize: 0,
      remainderSize: intent.sizeShares ?? 0,
      effectivePrice: 0,
      slippageBps: 0,
      grossAmount: 0,
      takerFee: 0,
      feeShares: 0,
      feeRate: 0,
      levels: [],
      filledAt,
      rejectReason: reason,
    };

    if (this.onFill) {
      this.onFill(intent, fill);
    }

    return fill;
  }
}
