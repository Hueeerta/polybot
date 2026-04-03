/**
 * Paper trading domain models.
 * These types represent simulated execution — no wallet, no signing, no real orders.
 */

export type OrderSide = 'buy' | 'sell';
export type PaperOrderType = 'FAK' | 'FOK';
export type FillStatus = 'filled' | 'partial' | 'rejected';

/**
 * Intent to execute a paper trade.
 * NOT a real signed order — a simulation request against the current orderbook.
 */
export interface OrderIntent {
  id: string;
  tokenId: string;
  side: OrderSide;
  /** Size in outcome shares. Mutually exclusive with notionalUsdc. */
  sizeShares?: number;
  /** Size in USDC notional. Mutually exclusive with sizeShares. */
  notionalUsdc?: number;
  /** FAK: fill what you can, cancel rest. FOK: all or nothing. */
  orderType: PaperOrderType;
  /** Who/what generated this intent */
  signalSource: string;
  timestamp: string;
  /** Optional price limit. Must be on tick_size grid. */
  limitPrice?: number;
}

/** A single level consumed during a fill. */
export interface FillLevel {
  price: number;
  size: number;
  /** USDC amount = price * size */
  usdcAmount: number;
}

/** Result of attempting to fill an OrderIntent against the orderbook. */
export interface FillResult {
  intentId: string;
  side: OrderSide;
  status: FillStatus;
  /** Shares actually filled */
  filledSize: number;
  /** Shares not filled (FAK remainder or FOK full size) */
  remainderSize: number;
  /** Volume-weighted average price across all levels consumed */
  effectivePrice: number;
  /** Slippage vs midprice in basis points */
  slippageBps: number;
  /** Total USDC exchanged before fees (price * size summed) */
  grossAmount: number;
  /** Taker fee in USDC */
  takerFee: number;
  /** Per-level fill detail */
  levels: FillLevel[];
  filledAt: string;
  /** Reason if rejected */
  rejectReason?: string;
}

/** A tracked position in the virtual portfolio. */
export interface Position {
  tokenId: string;
  /** Total shares held */
  shares: number;
  /** Volume-weighted average entry price */
  avgEntryPrice: number;
  /** Total USDC cost basis */
  totalCost: number;
  /** Latest known market price */
  currentPrice: number;
  /** (currentPrice - avgEntryPrice) * shares */
  unrealizedPnl: number;
  /** Cumulative realized P&L from closed/reduced positions */
  realizedPnl: number;
  /** Total fees paid on this position */
  totalFees: number;
}

/** Completed trade record for session history. */
export interface PaperTrade {
  intentId: string;
  tokenId: string;
  side: OrderSide;
  filledSize: number;
  effectivePrice: number;
  grossAmount: number;
  takerFee: number;
  slippageBps: number;
  signalSource: string;
  filledAt: string;
}

/** Per-market aggregated stats. */
export interface MarketStats {
  tokenId: string;
  trades: number;
  grossPnl: number;
  netPnl: number;
  totalFees: number;
  avgSlippageBps: number;
}

/** Per-signal-source aggregated stats. */
export interface SignalSourceStats {
  source: string;
  trades: number;
  grossPnl: number;
  netPnl: number;
  totalFees: number;
}

/** Session-level aggregated statistics. */
export interface SessionStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossPnl: number;
  totalFees: number;
  netPnl: number;
  avgSlippageBps: number;
  realizedPnl: number;
  unrealizedPnl: number;
  byMarket: MarketStats[];
  bySignalSource: SignalSourceStats[];
}

/** Paper trading configuration. */
export interface PaperConfig {
  initialBalanceUsdc: number;
  maxPositionSizeUsdc: number;
  maxOpenPositions: number;
  /** Taker fee in basis points. Applied to grossAmount on every fill. */
  takerFeeBps: number;
  /** Price tick size. Limit prices must be multiples of this. */
  tickSize: number;
  /** Minimum order size in shares. */
  minOrderSize: number;
  /** Reject fills if orderbook snapshot is older than this (ms). */
  staleBookThresholdMs: number;
}

export const PAPER_DEFAULTS: PaperConfig = {
  initialBalanceUsdc: 1000,
  maxPositionSizeUsdc: 100,
  maxOpenPositions: 5,
  /**
   * 200 bps (2%) as conservative default.
   * Polymarket's actual fee model charges on net winnings, not on trade notional.
   * This flat-per-trade model overestimates fees — intentionally conservative.
   * TODO: integrate per-market fee_rate_bps from last_trade_price frames.
   */
  takerFeeBps: 200,
  tickSize: 0.01,
  minOrderSize: 1,
  staleBookThresholdMs: 30_000,
};
