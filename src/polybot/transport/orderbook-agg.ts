/**
 * In-memory orderbook aggregator.
 * Maintains the latest OrderbookSnapshot per tokenId from WS frames.
 *
 * Handles:
 * - `book` frames: full snapshot replacement
 * - `price_change` frames: incremental level updates
 *
 * This is a general-purpose transport utility, NOT paper-specific.
 */

import type { OrderbookSnapshot, BookLevel } from '../models/orderbook.js';
import type { WsFrame } from './ws-subscriber.js';

export class OrderbookAggregator {
  private books = new Map<string, OrderbookSnapshot>();

  /** Process a WS frame. Only book and price_change are handled. */
  handleFrame(frame: WsFrame): void {
    if (frame.eventType === 'book') {
      this.handleBook(frame);
    } else if (frame.eventType === 'price_change') {
      this.handlePriceChange(frame);
    }
  }

  /** Get the latest orderbook for a tokenId, or undefined if none received. */
  getLatestBook(tokenId: string): OrderbookSnapshot | undefined {
    return this.books.get(tokenId);
  }

  /** All tokenIds with a stored book. */
  get tokenIds(): string[] {
    return [...this.books.keys()];
  }

  private handleBook(frame: WsFrame): void {
    const raw = frame.raw;
    const assetId = raw.asset_id as string | undefined;
    if (!assetId) return;

    const bids = this.parseLevels(raw.bids).sort((a, b) => b.price - a.price);
    const asks = this.parseLevels(raw.asks).sort((a, b) => a.price - b.price);

    this.books.set(assetId, this.buildSnapshot(assetId, bids, asks, frame.receivedAt));
  }

  /**
   * Handle price_change frames from Polymarket WS.
   *
   * Real WS format: { event_type: "price_change", market: "0x...",
   *   price_changes: [{ asset_id, price, size, side, ... }, ...] }
   *
   * Each entry in price_changes updates a different asset's book.
   */
  private handlePriceChange(frame: WsFrame): void {
    const raw = frame.raw;

    // Polymarket WS format: price_changes[] array with per-asset entries
    const priceChanges = raw.price_changes as Array<Record<string, string>> | undefined;
    if (Array.isArray(priceChanges)) {
      for (const change of priceChanges) {
        const assetId = change.asset_id;
        if (!assetId) continue;
        this.applyChange(assetId, change, frame.receivedAt);
      }
      return;
    }

    // Legacy/test fallback: top-level asset_id with changes[] or direct fields
    const assetId = raw.asset_id as string | undefined;
    if (!assetId) return;

    const changes = this.extractChanges(raw);
    for (const change of changes) {
      this.applySingleChange(assetId, change, frame.receivedAt);
    }
  }

  /** Apply a single price_change entry to the book for a given asset. */
  private applyChange(assetId: string, change: Record<string, string>, receivedAt: string): void {
    const existing = this.books.get(assetId);
    if (!existing) return; // Can't apply delta without a base snapshot

    const price = parseFloat(change.price ?? '0');
    const size = parseFloat(change.size ?? '0');
    const side = change.side?.toUpperCase() === 'SELL' ? 'sell' : 'buy';

    const bids = [...existing.bids];
    const asks = [...existing.asks];
    const levels = side === 'buy' ? bids : asks;

    const idx = levels.findIndex(l => Math.abs(l.price - price) < 1e-10);
    if (size < 1e-10) {
      if (idx >= 0) levels.splice(idx, 1);
    } else if (idx >= 0) {
      levels[idx] = { price, size };
    } else {
      levels.push({ price, size });
    }

    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);

    this.books.set(assetId, this.buildSnapshot(assetId, bids, asks, receivedAt));
  }

  /** Apply a parsed change object to the book. Used by legacy/test fallback. */
  private applySingleChange(
    assetId: string,
    change: { price: number; size: number; side: 'buy' | 'sell' },
    receivedAt: string,
  ): void {
    const existing = this.books.get(assetId);
    if (!existing) return;

    const bids = [...existing.bids];
    const asks = [...existing.asks];
    const levels = change.side === 'buy' ? bids : asks;

    const idx = levels.findIndex(l => Math.abs(l.price - change.price) < 1e-10);
    if (change.size < 1e-10) {
      if (idx >= 0) levels.splice(idx, 1);
    } else if (idx >= 0) {
      levels[idx] = { price: change.price, size: change.size };
    } else {
      levels.push({ price: change.price, size: change.size });
    }

    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);

    this.books.set(assetId, this.buildSnapshot(assetId, bids, asks, receivedAt));
  }

  private extractChanges(raw: Record<string, unknown>): Array<{ price: number; size: number; side: 'buy' | 'sell' }> {
    if (Array.isArray(raw.changes)) {
      return (raw.changes as Array<Record<string, string>>).map(c => ({
        price: parseFloat(c.price),
        size: parseFloat(c.size),
        side: (c.side?.toLowerCase() === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell',
      }));
    }

    // Single change with direct fields
    if (raw.price !== undefined && raw.side !== undefined) {
      return [{
        price: parseFloat(String(raw.price)),
        size: parseFloat(String(raw.size ?? '0')),
        side: (String(raw.side).toLowerCase() === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell',
      }];
    }

    return [];
  }

  private parseLevels(raw: unknown): BookLevel[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((l): l is Record<string, string> => typeof l === 'object' && l !== null)
      .map(l => ({
        price: parseFloat(l.price ?? '0'),
        size: parseFloat(l.size ?? '0'),
      }))
      .filter(l => l.size > 0);
  }

  private buildSnapshot(tokenId: string, bids: BookLevel[], asks: BookLevel[], capturedAt: string): OrderbookSnapshot {
    const bestBid = bids.length > 0 ? bids[0].price : undefined;
    const bestAsk = asks.length > 0 ? asks[0].price : undefined;
    const midPrice = bestBid !== undefined && bestAsk !== undefined
      ? (bestBid + bestAsk) / 2
      : undefined;
    const spread = bestBid !== undefined && bestAsk !== undefined
      ? bestAsk - bestBid
      : undefined;

    return { tokenId, bids, asks, bestBid, bestAsk, midPrice, spread, capturedAt };
  }
}
