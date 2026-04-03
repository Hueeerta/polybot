/**
 * Port interfaces for the paper trading module.
 * All implementations must be pure computation — zero network I/O.
 */

import type { OrderbookSnapshot } from '../models/orderbook.js';
import type {
  OrderIntent,
  FillResult,
  Position,
  SessionStats,
  PaperTrade,
  PaperConfig,
} from './models.js';
import type { WsFrame } from '../transport/ws-subscriber.js';

/**
 * Generates paper trading signals from market data.
 * Receives the current portfolio state so it can make position-aware decisions.
 */
export interface SignalProvider {
  readonly name: string;
  /**
   * Evaluate a WS frame and optionally produce OrderIntents.
   * Returns empty array if no action needed.
   */
  evaluate(
    frame: WsFrame,
    portfolio: VirtualPortfolio,
  ): OrderIntent[];
}

/**
 * Simulates order fills against a real orderbook snapshot.
 * Walks levels (asks for buys, bids for sells) to produce realistic fills.
 * Must NOT perform any network I/O.
 */
export interface FillEngine {
  /**
   * Attempt to fill an order intent against the given orderbook.
   * Returns filled, partial, or rejected result.
   */
  tryFill(intent: OrderIntent, book: OrderbookSnapshot): FillResult;
}

/**
 * Virtual portfolio tracking cash, positions, and P&L.
 * All state is in-memory and session-scoped.
 */
export interface VirtualPortfolio {
  /** Current USDC cash available for trading */
  readonly cashBalance: number;
  /** Initial USDC balance at session start */
  readonly initialBalance: number;

  /** All open positions */
  getPositions(): Position[];
  /** Get position for a specific tokenId, or undefined */
  getPosition(tokenId: string): Position | undefined;
  /** Apply a fill result to update balances and positions */
  applyFill(intent: OrderIntent, fill: FillResult): void;
  /** Update unrealized P&L using latest market prices */
  markToMarket(prices: Map<string, number>): void;
  /** Chronologically ordered trade history for this session */
  getTradeHistory(): PaperTrade[];
  /** Aggregated session statistics */
  getSessionStats(): SessionStats;
}

/**
 * Orchestrates the paper execution pipeline:
 * OrderIntent → query orderbook → fill → update portfolio → record.
 */
export interface PaperExecutor {
  /**
   * Process an order intent: validate, fill, and update portfolio.
   * Returns the fill result (including rejections).
   */
  execute(intent: OrderIntent): FillResult;
  /** Current portfolio state */
  readonly portfolio: VirtualPortfolio;
}

/**
 * Provides latest orderbook snapshots for fill simulation.
 * Decouples the fill engine from transport details.
 */
export interface OrderbookProvider {
  getLatestBook(tokenId: string): OrderbookSnapshot | undefined;
}
