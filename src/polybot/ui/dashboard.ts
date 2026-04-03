/**
 * Terminal health dashboard — periodic display of system status.
 */

import type { HealthStatus } from '../models/health.js';
import { formatHealthReport } from './formatters.js';

export class Dashboard {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private intervalMs: number = 5000) {}

  start(getHealth: () => HealthStatus): void {
    this.render(getHealth());
    this.timer = setInterval(() => {
      this.render(getHealth());
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private render(health: HealthStatus): void {
    // Clear previous output and redraw
    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write(formatHealthReport(health));
  }
}
