/**
 * Append-only JSONL recorder for domain events.
 */

import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import type { DomainEvent } from '../models/events.js';
import type { EventRecorder } from './types.js';
import type { RecorderConfig } from '../config/schema.js';
import { createSessionMeta, type SessionMeta } from './session.js';
import type { Config } from '../config/schema.js';

export class JsonlRecorder implements EventRecorder {
  private stream: WriteStream | null = null;
  private meta: SessionMeta | null = null;

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
    this.writeLine({ type: 'session_meta', ...this.meta });
  }

  async record(event: DomainEvent): Promise<void> {
    this.writeLine(event);
  }

  async stop(): Promise<void> {
    if (this.stream) {
      this.writeLine({
        type: 'session_end',
        timestamp: new Date().toISOString(),
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
