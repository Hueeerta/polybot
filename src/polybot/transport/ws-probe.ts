/**
 * Health probe for WebSocket connectivity.
 * Tests if the endpoint is reachable, measures latency.
 */

import WebSocket from 'ws';
import type { ProbeResult, TransportProbe } from './types.js';

export class WsProbe implements TransportProbe {
  constructor(
    private url: string,
    private timeoutMs: number = 5000
  ) {}

  async probe(): Promise<ProbeResult> {
    const start = Date.now();

    return new Promise<ProbeResult>((resolve) => {
      const timer = setTimeout(() => {
        ws.close();
        resolve({
          reachable: false,
          latencyMs: Date.now() - start,
          state: 'disconnected',
          error: `Connection timeout after ${this.timeoutMs}ms`,
        });
      }, this.timeoutMs);

      const ws = new WebSocket(this.url);

      ws.on('open', () => {
        const latencyMs = Date.now() - start;
        clearTimeout(timer);
        ws.close(1000);
        resolve({
          reachable: true,
          latencyMs,
          state: 'connected',
        });
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          reachable: false,
          latencyMs: Date.now() - start,
          state: 'disconnected',
          error: err.message || (err as NodeJS.ErrnoException).code || 'Connection failed',
        });
      });
    });
  }
}
