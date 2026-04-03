/**
 * Signal providers for paper trading.
 * These are test harnesses — the goal is to validate the execution engine,
 * not to generate alpha.
 */

import { randomUUID } from 'node:crypto';
import type { SignalProvider, VirtualPortfolio } from './types.js';
import type { OrderIntent, OrderSide, PaperOrderType } from './models.js';
import type { WsFrame } from '../transport/ws-subscriber.js';

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
