/**
 * Main orchestrator — wires components and manages lifecycle.
 * Strictly readonly: no paper, no live, no execution.
 */

import { randomUUID } from 'node:crypto';
import type { Config } from '../config/schema.js';
import type { HealthStatus, ComponentHealth, HealthState } from '../models/health.js';
import { Logger } from '../logging/logger.js';
import { GammaAdapter } from '../api/gamma-adapter.js';
import { ClobAdapter } from '../api/clob-adapter.js';
import { WsProbe } from '../transport/ws-probe.js';
import { JsonlRecorder } from '../recorder/jsonl-recorder.js';
import { Dashboard } from '../ui/dashboard.js';
import { ShutdownHandler } from './shutdown.js';

export class Orchestrator {
  private sessionId: string;
  private logger: Logger;
  private gamma: GammaAdapter;
  private clob: ClobAdapter;
  private wsProbe: WsProbe;
  private recorder: JsonlRecorder;
  private dashboard: Dashboard;
  private shutdown: ShutdownHandler;
  private health: HealthStatus;

  constructor(private config: Config) {
    this.sessionId = randomUUID().slice(0, 8);
    this.logger = new Logger('orchestrator', config.log, this.sessionId);
    this.gamma = new GammaAdapter(config.gamma);
    this.clob = new ClobAdapter(config.clob);
    this.wsProbe = new WsProbe(config.ws.url);
    this.recorder = new JsonlRecorder(config.recorder, config);
    this.dashboard = new Dashboard();
    this.shutdown = new ShutdownHandler();

    this.health = {
      overall: 'unknown',
      components: [],
      checkedAt: new Date().toISOString(),
    };
  }

  async start(): Promise<void> {
    this.logger.info('Starting polybot', { sessionId: this.sessionId, mode: this.config.mode });
    this.logger.initFileOutput();

    // Register shutdown hooks
    this.shutdown.register(async () => {
      this.dashboard.stop();
      await this.recorder.stop();
      this.logger.info('Shutdown complete');
      this.logger.close();
    });
    this.shutdown.install();

    // Start recorder
    await this.recorder.start(this.sessionId);
    await this.recorder.record({
      type: 'session_start',
      timestamp: new Date().toISOString(),
      source: 'orchestrator',
      sessionId: this.sessionId,
      payload: { mode: this.config.mode },
    });

    // Initial health check
    await this.refreshHealth();

    // Start dashboard
    this.dashboard.start(() => this.health);

    // Periodic health refresh
    setInterval(() => this.refreshHealth(), 30000);

    this.logger.info('Polybot running in readonly mode. Press Ctrl+C to stop.');
  }

  private async refreshHealth(): Promise<void> {
    const components: ComponentHealth[] = [];

    // Probe Gamma API
    const gammaHealth = await this.probeHttp('gamma', this.config.gamma.baseUrl + '/markets?limit=1');
    components.push(gammaHealth);

    // Probe CLOB API
    const clobHealth = await this.probeHttp('clob', this.config.clob.baseUrl + '/book?token_id=0');
    components.push(clobHealth);

    // Probe WebSocket
    const wsResult = await this.wsProbe.probe();
    components.push({
      name: 'websocket',
      state: wsResult.reachable ? 'healthy' : 'unhealthy',
      lastCheck: new Date().toISOString(),
      latencyMs: wsResult.latencyMs,
      message: wsResult.error,
      failures: wsResult.reachable ? 0 : 1,
    });

    // Aggregate
    const overall = this.aggregateHealth(components);
    this.health = {
      overall,
      components,
      checkedAt: new Date().toISOString(),
    };

    await this.recorder.record({
      type: 'health_check',
      timestamp: this.health.checkedAt,
      source: 'orchestrator',
      sessionId: this.sessionId,
      payload: this.health,
    });
  }

  private async probeHttp(name: string, url: string): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return {
        name,
        state: resp.ok ? 'healthy' : 'degraded',
        lastCheck: new Date().toISOString(),
        latencyMs: Date.now() - start,
        message: resp.ok ? undefined : `HTTP ${resp.status}`,
        failures: resp.ok ? 0 : 1,
      };
    } catch (err) {
      return {
        name,
        state: 'unhealthy',
        lastCheck: new Date().toISOString(),
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : String(err),
        failures: 1,
      };
    }
  }

  private aggregateHealth(components: ComponentHealth[]): HealthState {
    if (components.every(c => c.state === 'healthy')) return 'healthy';
    if (components.some(c => c.state === 'unhealthy')) return 'unhealthy';
    return 'degraded';
  }
}
