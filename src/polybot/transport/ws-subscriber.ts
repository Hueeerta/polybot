/**
 * WebSocket subscriber — manages market subscriptions and frame parsing.
 *
 * Handles:
 * - Subscription via assets_ids (decimal token IDs)
 * - Automatic resubscription after reconnect
 * - Frame classification (book, price_change, last_trade_price, etc.)
 * - Frame counting for observability
 */

import type { WsConnection } from './ws-connection.js';
import type { StreamingConfig } from '../config/schema.js';

/** Polymarket WS event types */
export type WsEventType =
  | 'book'
  | 'price_change'
  | 'last_trade_price'
  | 'tick_size_change'
  | 'best_bid_ask';

export interface WsFrame {
  eventType: WsEventType;
  raw: Record<string, unknown>;
  receivedAt: string;
}

export interface SubscriberStats {
  subscribedAssets: number;
  totalFrames: number;
  frameCounts: Record<WsEventType, number>;
  lastFrameAt: string | undefined;
}

export class WsSubscriber {
  private assetIds: string[] = [];
  private frameHandlers: Array<(frame: WsFrame) => void> = [];
  private _totalFrames = 0;
  private _frameCounts: Record<string, number> = {};
  private _lastFrameAt: string | undefined;

  constructor(
    private connection: WsConnection,
    private config: StreamingConfig,
  ) {
    this.connection.onMessage((data) => this.handleMessage(data));
    this.connection.onReconnected(() => this.resubscribe());
  }

  /** Subscribe to a set of decimal token IDs */
  subscribe(assetIds: string[]): void {
    this.assetIds = assetIds;
    this.sendSubscription();
  }

  /** Register a handler for parsed WS frames */
  onFrame(handler: (frame: WsFrame) => void): void {
    this.frameHandlers.push(handler);
  }

  get stats(): SubscriberStats {
    return {
      subscribedAssets: this.assetIds.length,
      totalFrames: this._totalFrames,
      frameCounts: { ...this._frameCounts } as Record<WsEventType, number>,
      lastFrameAt: this._lastFrameAt,
    };
  }

  private sendSubscription(): void {
    if (this.assetIds.length === 0) return;

    const msg: Record<string, unknown> = {
      assets_ids: this.assetIds,
      type: 'market',
      initial_dump: true,
    };

    if (this.config.customFeatureEnabled) {
      msg.custom_feature_enabled = true;
    }

    this.connection.send(JSON.stringify(msg));
  }

  private resubscribe(): void {
    if (this.assetIds.length > 0) {
      this.sendSubscription();
    }
  }

  private handleMessage(data: unknown): void {
    // Skip non-objects
    if (data === null || data === undefined) return;

    // Empty array = subscription ack with no data
    if (Array.isArray(data)) {
      if (data.length === 0) return;

      // Array of frames (initial dump can send multiple)
      for (const item of data) {
        if (typeof item === 'object' && item !== null) {
          this.classifyAndEmit(item as Record<string, unknown>);
        }
      }
      return;
    }

    // Single object frame
    if (typeof data === 'object') {
      this.classifyAndEmit(data as Record<string, unknown>);
    }
  }

  private classifyAndEmit(raw: Record<string, unknown>): void {
    const eventType = raw.event_type as string | undefined;
    if (!eventType) return; // not a data frame

    const known: WsEventType[] = ['book', 'price_change', 'last_trade_price', 'tick_size_change', 'best_bid_ask'];
    if (!known.includes(eventType as WsEventType)) return;

    const frame: WsFrame = {
      eventType: eventType as WsEventType,
      raw,
      receivedAt: new Date().toISOString(),
    };

    this._totalFrames++;
    this._frameCounts[eventType] = (this._frameCounts[eventType] || 0) + 1;
    this._lastFrameAt = frame.receivedAt;

    for (const h of this.frameHandlers) h(frame);
  }
}
