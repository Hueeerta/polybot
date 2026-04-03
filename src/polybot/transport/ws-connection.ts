/**
 * WebSocket connection manager with reconnection logic.
 * Uses `ws` package for low-level frame control.
 *
 * Keepalive: sends text "PING" per Polymarket protocol (not WS ping frame).
 * Stale detection: if no message arrives within staleTimeoutMs, triggers reconnect.
 */

import WebSocket from 'ws';
import type { ConnectionState, TransportConnection } from './types.js';
import type { WsConfig } from '../config/schema.js';

export class WsConnection implements TransportConnection {
  private ws: WebSocket | null = null;
  private messageHandlers: Array<(data: unknown) => void> = [];
  private errorHandlers: Array<(err: Error) => void> = [];
  private stateHandlers: Array<(state: ConnectionState) => void> = [];
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  private _state: ConnectionState = 'disconnected';
  private _lastMessageAt: string | undefined;
  private _reconnectCount = 0;
  private _onReconnected: Array<() => void> = [];

  /** Stale connection timeout — reconnect if no message for this long */
  private staleTimeoutMs: number;

  constructor(private config: WsConfig) {
    this.staleTimeoutMs = config.pingIntervalMs * 6; // 6 missed pings = stale
  }

  get state(): ConnectionState {
    return this._state;
  }

  get lastMessageAt(): string | undefined {
    return this._lastMessageAt;
  }

  get reconnectCount(): number {
    return this._reconnectCount;
  }

  async connect(): Promise<void> {
    this.shouldReconnect = true;
    return this.doConnect();
  }

  async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    this.clearTimers();
    if (this.ws) {
      this.ws.close(1000, 'client disconnect');
      this.ws = null;
    }
    this.setState('disconnected');
  }

  /** Send a text message over the WebSocket */
  send(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  onMessage(handler: (data: unknown) => void): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: (err: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  onStateChange(handler: (state: ConnectionState) => void): void {
    this.stateHandlers.push(handler);
  }

  /** Register a callback invoked after each successful reconnect */
  onReconnected(handler: () => void): void {
    this._onReconnected.push(handler);
  }

  private doConnect(): Promise<void> {
    const isReconnect = this._state === 'reconnecting';

    return new Promise((resolve, reject) => {
      this.setState('connecting');

      const ws = new WebSocket(this.config.url);

      ws.on('open', () => {
        this.ws = ws;
        this.reconnectAttempt = 0;
        this.setState('connected');
        this.startKeepalive();
        this.resetStaleTimer();

        if (isReconnect) {
          this._reconnectCount++;
          for (const h of this._onReconnected) h();
        }

        resolve();
      });

      ws.on('message', (data) => {
        const raw = data.toString();

        // Polymarket keepalive response — not a data frame
        if (raw === 'PONG') {
          this._lastMessageAt = new Date().toISOString();
          this.resetStaleTimer();
          return;
        }

        this._lastMessageAt = new Date().toISOString();
        this.resetStaleTimer();

        try {
          const parsed = JSON.parse(raw);
          for (const h of this.messageHandlers) h(parsed);
        } catch {
          for (const h of this.messageHandlers) h(raw);
        }
      });

      ws.on('close', (_code, _reason) => {
        this.clearTimers();
        this.ws = null;
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        } else {
          this.setState('disconnected');
        }
      });

      ws.on('error', (err) => {
        for (const h of this.errorHandlers) h(err);
        if (this._state === 'connecting') {
          reject(err);
        }
      });
    });
  }

  private scheduleReconnect(): void {
    this.setState('reconnecting');
    const delay = Math.min(
      this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempt),
      this.config.reconnectMaxDelayMs
    );
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.doConnect().catch((err) => {
        for (const h of this.errorHandlers) h(err);
        if (this.shouldReconnect) this.scheduleReconnect();
      });
    }, delay);
  }

  /** Send text "PING" per Polymarket protocol (not WS ping frame) */
  private startKeepalive(): void {
    this.keepaliveTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('PING');
      }
    }, this.config.pingIntervalMs);
  }

  /** If no message arrives within staleTimeoutMs, force reconnect */
  private resetStaleTimer(): void {
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.staleTimer = setTimeout(() => {
      if (this._state === 'connected' && this.shouldReconnect) {
        // Force close — will trigger reconnect via close handler
        this.ws?.close(4000, 'stale connection');
      }
    }, this.staleTimeoutMs);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.keepaliveTimer) { clearInterval(this.keepaliveTimer); this.keepaliveTimer = null; }
    if (this.staleTimer) { clearTimeout(this.staleTimer); this.staleTimer = null; }
  }

  private setState(s: ConnectionState): void {
    this._state = s;
    for (const h of this.stateHandlers) h(s);
  }
}
