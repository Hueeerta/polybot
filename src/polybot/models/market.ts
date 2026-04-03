/**
 * Domain model for Polymarket markets and outcomes.
 * Independent of any SDK — adapters translate API responses into these types.
 */

export interface Outcome {
  /** Human-readable label, e.g. "Yes", "No" */
  label: string;
  /** CLOB token ID for this outcome */
  tokenId: string;
  /** Current mid price (0-1), undefined if not yet fetched */
  price?: number;
}

export interface Market {
  /** Unique identifier (condition ID) */
  conditionId: string;
  /** URL-friendly slug */
  slug: string;
  /** The question being predicted */
  question: string;
  /** Possible outcomes with their tokens */
  outcomes: Outcome[];
  /** Whether the market is currently active */
  active: boolean;
  /** When the market was last updated (ISO 8601) */
  updatedAt?: string;
  /** End date of the market (ISO 8601), if known */
  endDate?: string;
  /** Total volume in USD, if available */
  volumeUsd?: number;
}
