/**
 * Paper trading module — integrates paper execution with live WS frames.
 *
 * Responsibilities:
 * - Feeds WS frames to OrderbookAggregator
 * - Evaluates signal providers on each frame
 * - Executes paper fills and records events
 * - Provides session stats for dashboard
 *
 * Zero real orders. Zero signing. Zero wallet interaction.
 */

import type { WsFrame } from '../transport/ws-subscriber.js';
import type { DomainEvent } from '../models/events.js';
import type { PaperConfig as SchemaPaperConfig } from '../config/schema.js';
import type { SignalProvider } from './types.js';
import type { OrderIntent, FillResult, SessionStats, PaperConfig } from './models.js';
import { OrderbookAggregator } from '../transport/orderbook-agg.js';
import { OrderbookFillEngine } from './fill-engine.js';
import { InMemoryPortfolio } from './portfolio.js';
import { DefaultPaperExecutor } from './executor.js';
import { RandomSignalProvider } from './signal-providers.js';

export interface PaperModuleConfig {
  /** Paper config from schema (env vars) */
  schemaConfig: SchemaPaperConfig;
  /** Session ID for event recording */
  sessionId: string;
  /** Callback to record events to JSONL */
  recordEvent: (event: DomainEvent) => Promise<void>;
}

/**
 * Convert schema PaperConfig (from env/config) to paper domain PaperConfig.
 * The schema config doesn't have feeRateBpsOverrides — that's populated at runtime.
 */
function toDomainConfig(schema: SchemaPaperConfig): PaperConfig {
  return {
    initialBalanceUsdc: schema.initialBalanceUsdc,
    maxPositionSizeUsdc: schema.maxPositionSizeUsdc,
    maxOpenPositions: schema.maxOpenPositions,
    defaultFeeRateBps: schema.defaultFeeRateBps,
    feeRateBpsOverrides: new Map(), // populated at runtime from CLOB API if available
    tickSize: schema.tickSize,
    minOrderSize: schema.minOrderSize,
    staleBookThresholdMs: schema.staleBookThresholdMs,
  };
}

export class PaperModule {
  private aggregator: OrderbookAggregator;
  private fillEngine: OrderbookFillEngine;
  private portfolio: InMemoryPortfolio;
  private executor: DefaultPaperExecutor;
  private signalProviders: SignalProvider[];
  private config: PaperConfig;
  private sessionId: string;
  private recordEvent: (event: DomainEvent) => Promise<void>;
  private _framesProcessed = 0;
  private _signalsGenerated = 0;
  private _fillsExecuted = 0;
  private _rejectsCount = 0;

  constructor(moduleConfig: PaperModuleConfig) {
    this.config = toDomainConfig(moduleConfig.schemaConfig);
    this.sessionId = moduleConfig.sessionId;
    this.recordEvent = moduleConfig.recordEvent;

    this.aggregator = new OrderbookAggregator();
    this.fillEngine = new OrderbookFillEngine(this.config);
    this.portfolio = new InMemoryPortfolio(this.config);

    this.executor = new DefaultPaperExecutor(
      this.fillEngine,
      this.portfolio,
      this.aggregator, // implements OrderbookProvider via getLatestBook
      this.config,
      // No onFill callback — recording is handled in handleFrame()
    );

    // Default signal provider: random with low probability for stress testing
    this.signalProviders = [
      new RandomSignalProvider({ probability: 0.05, sizeShares: 5 }),
    ];
  }

  /** Replace default signal providers (for testing or custom strategies). */
  setSignalProviders(providers: SignalProvider[]): void {
    this.signalProviders = providers;
  }

  /** Set per-token fee rate overrides (from CLOB API). */
  setFeeRateOverrides(overrides: Map<string, number>): void {
    this.config.feeRateBpsOverrides = overrides;
  }

  /**
   * Handle a WS frame — the main integration point.
   * Called from orchestrator's onFrame handler.
   */
  async handleFrame(frame: WsFrame): Promise<void> {
    this._framesProcessed++;

    // 1. Feed to orderbook aggregator
    this.aggregator.handleFrame(frame);

    // 2. Evaluate signal providers
    for (const provider of this.signalProviders) {
      const intents = provider.evaluate(frame, this.portfolio);

      for (const intent of intents) {
        this._signalsGenerated++;

        // Record signal event
        await this.recordEvent({
          type: 'paper_signal',
          timestamp: intent.timestamp,
          source: `paper/${provider.name}`,
          sessionId: this.sessionId,
          payload: intent,
        });

        // Record order event
        await this.recordEvent({
          type: 'paper_order',
          timestamp: new Date().toISOString(),
          source: 'paper/executor',
          sessionId: this.sessionId,
          payload: intent,
        });

        // Execute
        const fill = this.executor.execute(intent);

        // Record fill/rejection
        if (fill.status === 'rejected') {
          this._rejectsCount++;
          await this.recordEvent({
            type: 'paper_rejected',
            timestamp: fill.filledAt,
            source: 'paper/executor',
            sessionId: this.sessionId,
            payload: { intent, fill },
          });
        } else {
          this._fillsExecuted++;
          await this.recordEvent({
            type: 'paper_fill',
            timestamp: fill.filledAt,
            source: 'paper/executor',
            sessionId: this.sessionId,
            payload: { intent, fill },
          });
        }
      }
    }
  }

  /** Record a portfolio snapshot event. Called periodically from orchestrator. */
  async snapshotPortfolio(): Promise<void> {
    const stats = this.portfolio.getSessionStats();
    const positions = this.portfolio.getPositions();

    await this.recordEvent({
      type: 'paper_portfolio_snapshot',
      timestamp: new Date().toISOString(),
      source: 'paper/module',
      sessionId: this.sessionId,
      payload: {
        cashBalance: this.portfolio.cashBalance,
        positions,
        stats,
      },
    });
  }

  /** Mark positions to current market prices from orderbook. */
  markToMarket(): void {
    const prices = new Map<string, number>();
    for (const tokenId of this.aggregator.tokenIds) {
      const book = this.aggregator.getLatestBook(tokenId);
      if (book?.midPrice !== undefined) {
        prices.set(tokenId, book.midPrice);
      }
    }
    this.portfolio.markToMarket(prices);
  }

  /** Get current session stats for dashboard. */
  getSessionStats(): SessionStats {
    return this.portfolio.getSessionStats();
  }

  /** Get module-level metrics. */
  get metrics() {
    return {
      framesProcessed: this._framesProcessed,
      signalsGenerated: this._signalsGenerated,
      fillsExecuted: this._fillsExecuted,
      rejectsCount: this._rejectsCount,
      booksTracked: this.aggregator.tokenIds.length,
      cashBalance: this.portfolio.cashBalance,
      openPositions: this.portfolio.openPositionCount,
    };
  }
}
