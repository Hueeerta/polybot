/**
 * Generic domain event envelope for recording and replay.
 */

export type EventType =
  | 'market_discovered'
  | 'market_snapshot'
  | 'orderbook_snapshot'
  | 'ws_message'
  | 'ws_frame'
  | 'ws_book'
  | 'ws_price_change'
  | 'ws_last_trade_price'
  | 'ws_best_bid_ask'
  | 'ws_tick_size_change'
  | 'ws_connected'
  | 'ws_disconnected'
  | 'ws_reconnected'
  | 'ws_subscribed'
  | 'ws_error'
  | 'health_check'
  | 'session_start'
  | 'session_end'
  | 'session_summary'
  | 'paper_signal'
  | 'paper_order'
  | 'paper_fill'
  | 'paper_rejected'
  | 'paper_portfolio_snapshot';

export interface DomainEvent<T = unknown> {
  /** Event type identifier */
  type: EventType;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Source component */
  source: string;
  /** Session identifier */
  sessionId: string;
  /** Event payload */
  payload: T;
}
