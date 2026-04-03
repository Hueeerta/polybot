/**
 * Graceful shutdown handler for SIGINT and SIGTERM.
 */

export type ShutdownCallback = () => Promise<void>;

export class ShutdownHandler {
  private callbacks: ShutdownCallback[] = [];
  private shutting = false;

  register(cb: ShutdownCallback): void {
    this.callbacks.push(cb);
  }

  install(): void {
    const handler = () => { this.execute(); };
    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
  }

  private async execute(): Promise<void> {
    if (this.shutting) return;
    this.shutting = true;

    process.stderr.write('\nShutting down gracefully...\n');

    for (const cb of this.callbacks.reverse()) {
      try {
        await cb();
      } catch (err) {
        process.stderr.write(`Shutdown error: ${err}\n`);
      }
    }

    process.exit(0);
  }
}
