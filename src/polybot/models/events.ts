/**
 * Generic domain event envelope for recording and replay.
 */

export type EventType =
  | 'market_discovered'
  | 'orderbook_snapshot'
  | 'ws_message'
  | 'ws_connected'
  | 'ws_disconnected'
  | 'ws_error'
  | 'health_check'
  | 'session_start'
  | 'session_end';

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
