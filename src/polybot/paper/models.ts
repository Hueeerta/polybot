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
  /** Shares actually filled (before buy fee deduction) */
  filledSize: number;
  /** Shares not filled (FAK remainder or FOK full size) */
  remainderSize: number;
  /** Volume-weighted average price across all levels consumed */
  effectivePrice: number;
  /** Slippage vs midprice in basis points */
  slippageBps: number;
  /** Total USDC exchanged before fees (price * size summed) */
  grossAmount: number;
  /**
   * Fee in USDC. Symmetric around p=0.50.
   * Polymarket formula: C * feeRate * p * (1-p)
   * For buys, this is the USDC-equivalent of the shares fee (informational).
   * For sells, this is the actual fee deducted from proceeds.
   */
  takerFee: number;
  /**
   * Fee in outcome shares (buy side only).
   * feeShares = takerFee / p = C * feeRate * (1-p)
   * For sells, this is 0.
   */
  feeShares: number;
  /** Fee rate (decimal) used for this fill. E.g. 0.03 for Sports. */
  feeRate: number;
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
  /** Fee in USDC (actual for sells, USDC-equivalent for buys) */
  takerFee: number;
  /** Fee in shares (buy side only, 0 for sells) */
  feeShares: number;
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
  /**
   * Default taker fee rate (decimal, NOT bps).
   * Official Polymarket formula: fee = C × feeRate × p × (1-p)
   *
   * Category rates:
   *   Crypto: 0.072
   *   Sports: 0.03
   *   Finance/Politics/Mentions/Tech: 0.04
   *   Economics/Culture/Weather/Other: 0.05
   *   Geopolitics: 0 (free)
   */
  defaultFeeRate: number;
  /**
   * Per-token fee rate overrides (decimal).
   * Populated from CLOB API or market category mapping.
   * Key: tokenId, Value: fee rate as decimal (e.g. 0.03).
   */
  feeRateOverrides: Map<string, number>;
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
   * 0.05 default — matches Economics/Culture/Weather/Other.
   * Intentionally conservative (higher than Sports 0.03 or Politics 0.04).
   */
  defaultFeeRate: 0.05,
  feeRateOverrides: new Map(),
  tickSize: 0.01,
  minOrderSize: 1,
  staleBookThresholdMs: 30_000,
};
