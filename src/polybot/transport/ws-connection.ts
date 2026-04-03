/**
 * WebSocket connection manager with reconnection logic.
 * Uses `ws` package for low-level frame control (ping/pong).
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
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private shouldReconnect = false;
  private _state: ConnectionState = 'disconnected';
  private _lastMessageAt: string | undefined;

  constructor(private config: WsConfig) {}

  get state(): ConnectionState {
    return this._state;
  }

  get lastMessageAt(): string | undefined {
    return this._lastMessageAt;
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

  onMessage(handler: (data: unknown) => void): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: (err: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  onStateChange(handler: (state: ConnectionState) => void): void {
    this.stateHandlers.push(handler);
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.setState('connecting');

      const ws = new WebSocket(this.config.url);

      ws.on('open', () => {
        this.ws = ws;
        this.reconnectAttempt = 0;
        this.setState('connected');
        this.startPingInterval();
        resolve();
      });

      ws.on('message', (data) => {
        this._lastMessageAt = new Date().toISOString();
        try {
          const parsed = JSON.parse(data.toString());
          for (const h of this.messageHandlers) h(parsed);
        } catch {
          for (const h of this.messageHandlers) h(data.toString());
        }
      });

      ws.on('close', (code, reason) => {
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

      ws.on('pong', () => {
        this._lastMessageAt = new Date().toISOString();
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

  private startPingInterval(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.config.pingIntervalMs);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  private setState(s: ConnectionState): void {
    this._state = s;
    for (const h of this.stateHandlers) h(s);
  }
}
