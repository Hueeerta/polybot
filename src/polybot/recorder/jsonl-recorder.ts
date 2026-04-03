/**
 * Append-only JSONL recorder for domain events.
 * Tracks frame counts and writes session summary on close.
 */

import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import type { DomainEvent } from '../models/events.js';
import type { EventRecorder } from './types.js';
import type { RecorderConfig } from '../config/schema.js';
import { createSessionMeta, type SessionMeta } from './session.js';
import type { Config } from '../config/schema.js';

export interface SessionSummary {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  totalEvents: number;
  eventCounts: Record<string, number>;
  reconnectCount: number;
}

export class JsonlRecorder implements EventRecorder {
  private stream: WriteStream | null = null;
  private meta: SessionMeta | null = null;
  private startTime: number = 0;
  private eventCount = 0;
  private eventCounts: Record<string, number> = {};
  private _reconnectCount = 0;

  constructor(
    private recorderConfig: RecorderConfig,
    private fullConfig: Config
  ) {}

  async start(sessionId: string): Promise<void> {
    mkdirSync(this.recorderConfig.dir, { recursive: true });

    const filename = `session-${sessionId}.jsonl`;
    const filepath = join(this.recorderConfig.dir, filename);
    this.stream = createWriteStream(filepath, { flags: 'a' });

    this.meta = createSessionMeta(sessionId, this.fullConfig);
    this.startTime = Date.now();
    this.eventCount = 0;
    this.eventCounts = {};
    this._reconnectCount = 0;

    this.writeLine({ type: 'session_meta', ...this.meta });
  }

  async record(event: DomainEvent): Promise<void> {
    this.writeLine(event);
    this.eventCount++;
    this.eventCounts[event.type] = (this.eventCounts[event.type] || 0) + 1;
  }

  /** Increment reconnect counter (called by orchestrator) */
  trackReconnect(): void {
    this._reconnectCount++;
  }

  /** Get current session stats */
  get stats(): { eventCount: number; eventCounts: Record<string, number>; reconnectCount: number } {
    return {
      eventCount: this.eventCount,
      eventCounts: { ...this.eventCounts },
      reconnectCount: this._reconnectCount,
    };
  }

  async stop(): Promise<void> {
    if (this.stream) {
      const now = new Date().toISOString();

      // Write session summary
      const summary: SessionSummary = {
        sessionId: this.meta?.sessionId ?? '',
        startedAt: this.meta?.startedAt ?? '',
        endedAt: now,
        durationMs: Date.now() - this.startTime,
        totalEvents: this.eventCount,
        eventCounts: { ...this.eventCounts },
        reconnectCount: this._reconnectCount,
      };
      this.writeLine({ type: 'session_summary', ...summary });

      // Write session end
      this.writeLine({
        type: 'session_end',
        timestamp: now,
        sessionId: this.meta?.sessionId,
      });

      return new Promise((resolve) => {
        this.stream!.end(() => {
          this.stream = null;
          resolve();
        });
      });
    }
  }

  private writeLine(data: unknown): void {
    if (this.stream) {
      this.stream.write(JSON.stringify(data) + '\n');
    }
  }
}
