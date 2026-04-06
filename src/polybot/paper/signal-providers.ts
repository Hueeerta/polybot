/**
 * Signal providers for paper trading.
 * These are test harnesses — the goal is to validate the execution engine,
 * not to generate alpha.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { SignalProvider, VirtualPortfolio } from './types.js';
import type { OrderIntent, OrderSide, PaperOrderType } from './models.js';
import type { WsFrame } from '../transport/ws-subscriber.js';
import type { DomainEvent } from '../models/events.js';

/**
 * Fires random buy/sell signals on price_change frames.
 * Useful for stress-testing the paper execution pipeline.
 */
export class RandomSignalProvider implements SignalProvider {
  readonly name = 'random';

  constructor(
    private options: {
      /** Probability of firing a signal on each price_change frame (0-1) */
      probability?: number;
      /** Fixed size in shares per signal */
      sizeShares?: number;
      /** Order type for generated intents */
      orderType?: PaperOrderType;
    } = {}
  ) {}

  evaluate(frame: WsFrame, portfolio: VirtualPortfolio): OrderIntent[] {
    if (frame.eventType !== 'price_change') return [];

    const probability = this.options.probability ?? 0.1;
    if (Math.random() > probability) return [];

    const assetId = frame.raw.asset_id as string | undefined;
    if (!assetId) return [];

    // Decide side: sell if we hold a position, otherwise buy
    const existing = portfolio.getPosition(assetId);
    const side: OrderSide = existing && existing.shares > 0 && Math.random() < 0.5
      ? 'sell'
      : 'buy';

    // If selling, sell what we have (up to sizeShares)
    const sizeShares = side === 'sell' && existing
      ? Math.min(this.options.sizeShares ?? 10, existing.shares)
      : (this.options.sizeShares ?? 10);

    if (sizeShares < 1e-10) return [];

    return [{
      id: randomUUID().slice(0, 8),
      tokenId: assetId,
      side,
      sizeShares,
      orderType: this.options.orderType ?? 'FAK',
      signalSource: this.name,
      timestamp: new Date().toISOString(),
    }];
  }
}

/**
 * Fires a predefined sequence of signals.
 * Useful for deterministic testing and replay validation.
 */
export class StaticSignalProvider implements SignalProvider {
  readonly name = 'static';
  private index = 0;
  private signalsByTokenId = new Map<string, OrderIntent[]>();

  constructor(signals: OrderIntent[]) {
    // Index by tokenId for frame-based lookup
    for (const signal of signals) {
      const list = this.signalsByTokenId.get(signal.tokenId) ?? [];
      list.push(signal);
      this.signalsByTokenId.set(signal.tokenId, list);
    }
  }

  evaluate(frame: WsFrame, _portfolio: VirtualPortfolio): OrderIntent[] {
    const assetId = frame.raw.asset_id as string | undefined;
    if (!assetId) return [];

    const signals = this.signalsByTokenId.get(assetId);
    if (!signals || signals.length === 0) return [];

    // Emit the next signal for this tokenId
    const next = signals.shift();
    return next ? [next] : [];
  }

  /** Reset the provider to replay from the beginning. */
  reset(signals: OrderIntent[]): void {
    this.signalsByTokenId.clear();
    this.index = 0;
    for (const signal of signals) {
      const list = this.signalsByTokenId.get(signal.tokenId) ?? [];
      list.push(signal);
      this.signalsByTokenId.set(signal.tokenId, list);
    }
  }
}

/**
 * Replays paper_signal events from a recorded JSONL session file.
 * Extracts OrderIntents from paper_signal events and emits them
 * in order, matching by tokenId on incoming frames.
 *
 * Usage: load a previous session JSONL, extract signals, replay them
 * against a new (or same) WS data feed.
 */
export class ReplaySignalProvider implements SignalProvider {
  readonly name = 'replay';
  private delegate: StaticSignalProvider;
  private _signalCount: number;

  constructor(signals: OrderIntent[]) {
    this._signalCount = signals.length;
    this.delegate = new StaticSignalProvider(signals);
  }

  /** Number of signals loaded for replay. */
  get signalCount(): number {
    return this._signalCount;
  }

  evaluate(frame: WsFrame, portfolio: VirtualPortfolio): OrderIntent[] {
    return this.delegate.evaluate(frame, portfolio);
  }

  /**
   * Load signals from a JSONL session file.
   * Extracts paper_signal events and returns a new ReplaySignalProvider.
   */
  static fromJsonlFile(filePath: string): ReplaySignalProvider {
    const content = readFileSync(filePath, 'utf-8');
    const signals: OrderIntent[] = [];

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as DomainEvent;
        if (event.type === 'paper_signal' && event.payload) {
          const payload = event.payload as OrderIntent;
          if (payload.id && payload.tokenId && payload.side) {
            signals.push(payload);
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    return new ReplaySignalProvider(signals);
  }
}
