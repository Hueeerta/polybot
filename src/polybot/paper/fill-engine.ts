/**
 * Orderbook fill engine — simulates taker fills by walking the real book.
 *
 * Walks asks (ascending) for buys, bids (descending) for sells.
 * Respects FAK (fill-and-kill) and FOK (fill-or-kill) semantics.
 * Calculates effective price, slippage, and fees per fill.
 *
 * Zero network I/O. Pure computation on OrderbookSnapshot input.
 */

import type { OrderbookSnapshot } from '../models/orderbook.js';
import type { FillEngine } from './types.js';
import type { OrderIntent, FillResult, FillLevel, PaperConfig } from './models.js';

export class OrderbookFillEngine implements FillEngine {
  constructor(private config: PaperConfig) {}

  tryFill(intent: OrderIntent, book: OrderbookSnapshot): FillResult {
    const now = new Date().toISOString();

    // Validate book freshness
    const bookAge = Date.now() - new Date(book.capturedAt).getTime();
    if (bookAge > this.config.staleBookThresholdMs) {
      return this.rejected(intent, now, `stale_book: ${Math.floor(bookAge / 1000)}s old`);
    }

    // Resolve effective size in shares
    const effectiveSize = this.resolveSize(intent, book);
    if (effectiveSize === undefined) {
      return this.rejected(intent, now, 'cannot_resolve_size: no price available for notional conversion');
    }

    // Validate min order size
    if (effectiveSize < this.config.minOrderSize) {
      return this.rejected(intent, now, `below_min_order_size: ${effectiveSize} < ${this.config.minOrderSize}`);
    }

    // Validate limit price tick alignment
    if (intent.limitPrice !== undefined) {
      const remainder = intent.limitPrice % this.config.tickSize;
      if (Math.abs(remainder) > 1e-10 && Math.abs(remainder - this.config.tickSize) > 1e-10) {
        return this.rejected(intent, now, `limit_price_not_on_tick: ${intent.limitPrice} (tick=${this.config.tickSize})`);
      }
    }

    // Select book side to walk
    const levels = intent.side === 'buy' ? book.asks : book.bids;
    if (levels.length === 0) {
      return this.rejected(intent, now, 'no_liquidity');
    }

    // Walk the book
    let remaining = effectiveSize;
    let totalCost = 0;
    const fillLevels: FillLevel[] = [];

    for (const level of levels) {
      if (remaining <= 0) break;

      // Check limit price constraint
      if (intent.limitPrice !== undefined) {
        if (intent.side === 'buy' && level.price > intent.limitPrice) break;
        if (intent.side === 'sell' && level.price < intent.limitPrice) break;
      }

      const takeSize = Math.min(remaining, level.size);
      const usdcAmount = takeSize * level.price;

      fillLevels.push({ price: level.price, size: takeSize, usdcAmount });
      totalCost += usdcAmount;
      remaining -= takeSize;
    }

    const filledSize = effectiveSize - remaining;

    // FOK: all or nothing
    if (intent.orderType === 'FOK' && remaining > 0) {
      return this.rejected(intent, now, `insufficient_depth_fok: need ${effectiveSize}, available ${filledSize}`);
    }

    // Nothing fillable
    if (filledSize < 1e-10) {
      return this.rejected(intent, now, 'no_fillable_liquidity');
    }

    // Partial fill below min_order_size → reject
    if (filledSize < this.config.minOrderSize) {
      return this.rejected(intent, now, `partial_below_min_order_size: ${filledSize} < ${this.config.minOrderSize}`);
    }

    const effectivePrice = totalCost / filledSize;
    const midPrice = book.midPrice ?? effectivePrice;
    const slippageBps = midPrice > 0
      ? Math.abs(effectivePrice - midPrice) / midPrice * 10_000
      : 0;

    const takerFee = totalCost * (this.config.takerFeeBps / 10_000);

    return {
      intentId: intent.id,
      side: intent.side,
      status: remaining > 0 ? 'partial' : 'filled',
      filledSize,
      remainderSize: remaining,
      effectivePrice,
      slippageBps,
      grossAmount: totalCost,
      takerFee,
      levels: fillLevels,
      filledAt: now,
    };
  }

  /**
   * Resolve the effective size in shares.
   * If sizeShares is provided, use directly.
   * If notionalUsdc is provided, convert using the best available price.
   */
  private resolveSize(intent: OrderIntent, book: OrderbookSnapshot): number | undefined {
    if (intent.sizeShares !== undefined && intent.sizeShares > 0) {
      return intent.sizeShares;
    }

    if (intent.notionalUsdc !== undefined && intent.notionalUsdc > 0) {
      // Use best price on the relevant side to estimate shares
      const price = intent.side === 'buy' ? book.bestAsk : book.bestBid;
      if (price === undefined || price <= 0) return undefined;
      return intent.notionalUsdc / price;
    }

    return undefined;
  }

  private rejected(intent: OrderIntent, filledAt: string, reason: string): FillResult {
    return {
      intentId: intent.id,
      side: intent.side,
      status: 'rejected',
      filledSize: 0,
      remainderSize: intent.sizeShares ?? 0,
      effectivePrice: 0,
      slippageBps: 0,
      grossAmount: 0,
      takerFee: 0,
      levels: [],
      filledAt,
      rejectReason: reason,
    };
  }
}
