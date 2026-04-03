/**
 * Port interfaces for market data providers.
 * Domain depends on these interfaces, NOT on SDK implementations.
 * Adapters implement these using whatever transport they need.
 */

import type { Market } from '../models/market.js';
import type { OrderbookSnapshot } from '../models/orderbook.js';

export interface MarketProvider {
  /** Discover active markets, optionally filtered */
  getMarkets(opts?: { limit?: number; active?: boolean }): Promise<Market[]>;
  /** Get a single market by slug */
  getMarketBySlug(slug: string): Promise<Market | null>;
  /** Get a single market by condition ID */
  getMarketByConditionId(conditionId: string): Promise<Market | null>;
}

export interface OrderbookProvider {
  /** Get the current orderbook for a token */
  getOrderbook(tokenId: string): Promise<OrderbookSnapshot>;
}
