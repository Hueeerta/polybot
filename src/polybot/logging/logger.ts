/**
 * Structured JSON logger with level filtering and context injection.
 */

import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import type { LogConfig } from '../config/schema.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LogEntry {
  level: LogLevel;
  timestamp: string;
  component: string;
  message: string;
  sessionId?: string;
  data?: Record<string, unknown>;
}

export class Logger {
  private fileStream: WriteStream | null = null;
  private minLevel: number;

  constructor(
    private component: string,
    private config: LogConfig,
    private sessionId?: string
  ) {
    this.minLevel = LEVEL_ORDER[config.level];
  }

  /** Create a child logger with a sub-component name */
  child(subComponent: string): Logger {
    return new Logger(`${this.component}:${subComponent}`, this.config, this.sessionId);
  }

  initFileOutput(): void {
    mkdirSync(this.config.dir, { recursive: true });
    const filename = `polybot-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    this.fileStream = createWriteStream(join(this.config.dir, filename), { flags: 'a' });
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  close(): void {
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < this.minLevel) return;

    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      component: this.component,
      message,
      ...(data ? { data } : {}),
    };

    if (this.sessionId) {
      entry.sessionId = this.sessionId;
    }

    const line = JSON.stringify(entry);

    if (level === 'error' || level === 'warn') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }

    if (this.fileStream) {
      this.fileStream.write(line + '\n');
    }
  }
}
