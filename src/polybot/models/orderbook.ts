/**
 * Domain model for orderbook snapshots.
 * Independent of any SDK.
 */

export interface BookLevel {
  price: number;
  size: number;
}

export interface OrderbookSnapshot {
  /** Token ID this orderbook belongs to */
  tokenId: string;
  /** Bid levels sorted by price descending */
  bids: BookLevel[];
  /** Ask levels sorted by price ascending */
  asks: BookLevel[];
  /** Best bid price, or undefined if empty */
  bestBid?: number;
  /** Best ask price, or undefined if empty */
  bestAsk?: number;
  /** Mid price between best bid and ask, or undefined */
  midPrice?: number;
  /** Spread between best ask and best bid */
  spread?: number;
  /** When this snapshot was captured (ISO 8601) */
  capturedAt: string;
}
