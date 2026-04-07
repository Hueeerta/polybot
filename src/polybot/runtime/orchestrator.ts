/**
 * Main orchestrator — wires components and manages lifecycle.
 *
 * Supports readonly and paper modes:
 * - readonly: WS streaming, recording, dashboard (no execution)
 * - paper: readonly + paper trading module (simulated execution)
 */

import { randomUUID } from 'node:crypto';
import type { Config } from '../config/schema.js';
import type { HealthStatus, ComponentHealth, HealthState, StreamingStats, PaperStats } from '../models/health.js';
import { Logger } from '../logging/logger.js';
import { GammaAdapter } from '../api/gamma-adapter.js';
import { ClobAdapter } from '../api/clob-adapter.js';
import { WsConnection } from '../transport/ws-connection.js';
import { WsSubscriber } from '../transport/ws-subscriber.js';
import { WsProbe } from '../transport/ws-probe.js';
import { JsonlRecorder } from '../recorder/jsonl-recorder.js';
import { Dashboard } from '../ui/dashboard.js';
import { ShutdownHandler } from './shutdown.js';
import { PaperModule } from '../paper/paper-module.js';

export class Orchestrator {
  private sessionId: string;
  private logger: Logger;
  private gamma: GammaAdapter;
  private clob: ClobAdapter;
  private wsConnection: WsConnection;
  private wsSubscriber: WsSubscriber;
  private wsProbe: WsProbe;
  private recorder: JsonlRecorder;
  private dashboard: Dashboard;
  private shutdown: ShutdownHandler;
  private health: HealthStatus;
  private startTime: number = 0;
  private subscribedMarketNames: string[] = [];
  private paperModule: PaperModule | null = null;
  private paperSnapshotTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private config: Config) {
    this.sessionId = randomUUID().slice(0, 8);
    this.logger = new Logger('orchestrator', config.log, this.sessionId);
    this.gamma = new GammaAdapter(config.gamma);
    this.clob = new ClobAdapter(config.clob);
    this.wsConnection = new WsConnection(config.ws);
    this.wsSubscriber = new WsSubscriber(this.wsConnection, config.streaming);
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
    this.startTime = Date.now();
    this.logger.info('Starting polybot', { sessionId: this.sessionId, mode: this.config.mode });
    this.logger.initFileOutput();

    // Register shutdown hooks
    this.shutdown.register(async () => {
      this.dashboard.stop();
      if (this.paperSnapshotTimer) clearInterval(this.paperSnapshotTimer);
      if (this.paperModule) {
        this.paperModule.markToMarket();
        await this.paperModule.snapshotPortfolio();
        this.logPaperSummary();
      }
      await this.wsConnection.disconnect();
      this.logSessionSummary();
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

    // Wire WS connection events to recorder
    this.wireWsEvents();

    // Initialize paper module if mode=paper
    if (this.config.mode === 'paper' && this.config.paper) {
      this.initPaperModule();
    }

    // Discover markets and start streaming
    await this.startStreaming();

    // Fetch per-token fee rates for paper mode (best-effort, falls back to default)
    if (this.paperModule) {
      await this.fetchFeeRates();
    }

    // Initial health check
    await this.refreshHealth();

    // Start dashboard — compute live streaming stats each render
    this.dashboard.start(() => ({
      ...this.health,
      streaming: this.getLiveStreamingStats(),
      paper: this.paperModule ? this.getPaperStats() : undefined,
    }));

    // Periodic health refresh
    setInterval(() => this.refreshHealth(), 30000);

    const modeLabel = this.config.mode === 'paper' ? 'paper trading' : 'readonly';
    this.logger.info(`Polybot streaming in ${modeLabel} mode. Press Ctrl+C to stop.`);
  }

  private initPaperModule(): void {
    if (!this.config.paper) return;

    this.paperModule = new PaperModule({
      schemaConfig: this.config.paper,
      sessionId: this.sessionId,
      recordEvent: (event) => this.recorder.record(event),
    });

    // Wire paper module as a second onFrame handler
    this.wsSubscriber.onFrame(async (frame) => {
      await this.paperModule!.handleFrame(frame);
    });

    // Periodic mark-to-market and portfolio snapshot (every 30s)
    this.paperSnapshotTimer = setInterval(async () => {
      if (this.paperModule) {
        this.paperModule.markToMarket();
        await this.paperModule.snapshotPortfolio();
      }
    }, 30_000);

    this.logger.info('Paper trading module initialized', {
      initialBalance: this.config.paper.initialBalanceUsdc,
      feeRate: this.config.paper.defaultFeeRate,
      maxPositionSize: this.config.paper.maxPositionSizeUsdc,
    });
  }

  /**
   * Fetch per-token fee rates from CLOB API.
   * Best-effort: if the endpoint returns 0 (unauthenticated) or fails,
   * PaperModule falls back to config.paper.defaultFeeRate.
   */
  private async fetchFeeRates(): Promise<void> {
    if (!this.paperModule || this.subscribedMarketNames.length === 0) return;

    const overrides = new Map<string, number>();
    // Collect token IDs from the WS subscriber's subscribed assets
    // We re-derive from markets since we stored subscribedMarketNames but not tokenIds
    const markets = await this.gamma.getMarkets({ limit: this.config.streaming.marketCount });

    for (const market of markets) {
      for (const outcome of market.outcomes) {
        if (!outcome.tokenId) continue;
        try {
          const feeRate = await this.clob.getFeeRate(outcome.tokenId);
          if (feeRate > 0) {
            overrides.set(outcome.tokenId, feeRate);
          }
        } catch (err) {
          this.logger.warn('Failed to fetch fee rate', {
            tokenId: outcome.tokenId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    if (overrides.size > 0) {
      this.paperModule.setFeeRateOverrides(overrides);
      this.logger.info('Per-token fee rates loaded from CLOB API', {
        tokensWithCustomRate: overrides.size,
        rates: Object.fromEntries(overrides),
      });
    } else {
      this.logger.info('No per-token fee rates from CLOB API, using default', {
        defaultFeeRate: this.config.paper?.defaultFeeRate,
      });
    }
  }

  private getPaperStats(): PaperStats {
    if (!this.paperModule) {
      throw new Error('Paper module not initialized');
    }
    const stats = this.paperModule.getSessionStats();
    const metrics = this.paperModule.metrics;
    return {
      cashBalance: metrics.cashBalance,
      initialBalance: this.config.paper?.initialBalanceUsdc ?? 1000,
      openPositions: metrics.openPositions,
      totalTrades: stats.totalTrades,
      signalsGenerated: metrics.signalsGenerated,
      fillsExecuted: metrics.fillsExecuted,
      rejectsCount: metrics.rejectsCount,
      framesProcessed: metrics.framesProcessed,
      booksTracked: metrics.booksTracked,
      realizedPnl: stats.realizedPnl,
      unrealizedPnl: stats.unrealizedPnl,
      netPnl: stats.netPnl,
      totalFees: stats.totalFees,
      winRate: stats.winRate,
    };
  }

  private wireWsEvents(): void {
    this.wsConnection.onStateChange(async (state) => {
      this.logger.info('WS state change', { state });
      await this.recorder.record({
        type: state === 'connected' ? 'ws_connected' : state === 'disconnected' ? 'ws_disconnected' : 'ws_message',
        timestamp: new Date().toISOString(),
        source: 'ws-connection',
        sessionId: this.sessionId,
        payload: { state },
      });
    });

    this.wsConnection.onReconnected(async () => {
      this.logger.info('WS reconnected', { attempt: this.wsConnection.reconnectCount });
      this.recorder.trackReconnect();
      await this.recorder.record({
        type: 'ws_reconnected',
        timestamp: new Date().toISOString(),
        source: 'ws-connection',
        sessionId: this.sessionId,
        payload: { reconnectCount: this.wsConnection.reconnectCount },
      });
    });

    this.wsConnection.onError((err) => {
      this.logger.error('WS error', { error: err.message });
    });

    // Record every data frame
    this.wsSubscriber.onFrame(async (frame) => {
      const eventType = `ws_${frame.eventType}` as const;
      await this.recorder.record({
        type: eventType,
        timestamp: frame.receivedAt,
        source: 'ws-subscriber',
        sessionId: this.sessionId,
        payload: frame.raw,
      });
    });
  }

  private async startStreaming(): Promise<void> {
    // Discover top markets
    const marketCount = this.config.streaming.marketCount;
    this.logger.info('Discovering markets', { count: marketCount });

    const markets = await this.gamma.getMarkets({ limit: marketCount });
    if (markets.length === 0) {
      this.logger.warn('No markets found — streaming disabled');
      return;
    }

    // Collect all token IDs from all markets
    const allTokenIds: string[] = [];
    this.subscribedMarketNames = [];

    for (const market of markets) {
      this.subscribedMarketNames.push(market.slug);
      for (const outcome of market.outcomes) {
        if (outcome.tokenId) {
          allTokenIds.push(outcome.tokenId);
        }
      }

      // Record market discovery
      await this.recorder.record({
        type: 'market_discovered',
        timestamp: new Date().toISOString(),
        source: 'orchestrator',
        sessionId: this.sessionId,
        payload: market,
      });
    }

    this.logger.info('Markets discovered', {
      markets: this.subscribedMarketNames,
      tokenIds: allTokenIds.length,
    });

    // Connect WS and subscribe
    try {
      await this.wsConnection.connect();
      this.wsSubscriber.subscribe(allTokenIds);

      this.logger.info('WS subscribed', { assets: allTokenIds.length });
      await this.recorder.record({
        type: 'ws_subscribed',
        timestamp: new Date().toISOString(),
        source: 'orchestrator',
        sessionId: this.sessionId,
        payload: { markets: this.subscribedMarketNames, assetCount: allTokenIds.length },
      });
    } catch (err) {
      this.logger.error('WS connection failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async refreshHealth(): Promise<void> {
    const components: ComponentHealth[] = [];

    // Probe Gamma API
    const gammaHealth = await this.probeHttp('gamma', this.config.gamma.baseUrl + '/markets?limit=1');
    components.push(gammaHealth);

    // Probe CLOB API (base URL returns 200 if service is up)
    const clobHealth = await this.probeHttp('clob', this.config.clob.baseUrl + '/');
    components.push(clobHealth);

    // WebSocket health based on connection state and frame recency
    const wsState = this.wsConnection.state;
    const lastFrame = this.wsSubscriber.stats.lastFrameAt;
    let wsHealthState: HealthState = 'unknown';
    let wsMessage: string | undefined;

    if (wsState === 'connected') {
      if (lastFrame) {
        const frameAge = Date.now() - new Date(lastFrame).getTime();
        wsHealthState = frameAge < 60000 ? 'healthy' : 'degraded';
        if (frameAge >= 60000) wsMessage = `last frame ${Math.floor(frameAge / 1000)}s ago`;
      } else {
        wsHealthState = 'degraded';
        wsMessage = 'connected but no frames yet';
      }
    } else if (wsState === 'reconnecting') {
      wsHealthState = 'degraded';
      wsMessage = `reconnecting (attempt ${this.wsConnection.reconnectCount + 1})`;
    } else {
      wsHealthState = 'unhealthy';
      wsMessage = wsState;
    }

    components.push({
      name: 'websocket',
      state: wsHealthState,
      lastCheck: new Date().toISOString(),
      message: wsMessage,
      failures: wsHealthState === 'unhealthy' ? 1 : 0,
    });

    // Aggregate
    const overall = this.aggregateHealth(components);

    // Build streaming stats
    const subStats = this.wsSubscriber.stats;
    const recStats = this.recorder.stats;
    const streaming: StreamingStats = {
      wsState,
      subscribedAssets: subStats.subscribedAssets,
      totalFrames: subStats.totalFrames,
      frameCounts: subStats.frameCounts,
      lastFrameAt: subStats.lastFrameAt,
      reconnectCount: recStats.reconnectCount,
      sessionEvents: recStats.eventCount,
      sessionDurationMs: Date.now() - this.startTime,
    };

    this.health = {
      overall,
      components,
      checkedAt: new Date().toISOString(),
      streaming,
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

  private getLiveStreamingStats(): StreamingStats {
    const subStats = this.wsSubscriber.stats;
    const recStats = this.recorder.stats;
    return {
      wsState: this.wsConnection.state,
      subscribedAssets: subStats.subscribedAssets,
      totalFrames: subStats.totalFrames,
      frameCounts: subStats.frameCounts,
      lastFrameAt: subStats.lastFrameAt,
      reconnectCount: recStats.reconnectCount,
      sessionEvents: recStats.eventCount,
      sessionDurationMs: Date.now() - this.startTime,
    };
  }

  private logPaperSummary(): void {
    if (!this.paperModule) return;
    const stats = this.paperModule.getSessionStats();
    const metrics = this.paperModule.metrics;
    this.logger.info('Paper trading summary', {
      cashBalance: metrics.cashBalance,
      openPositions: metrics.openPositions,
      totalTrades: stats.totalTrades,
      signalsGenerated: metrics.signalsGenerated,
      fillsExecuted: metrics.fillsExecuted,
      rejects: metrics.rejectsCount,
      realizedPnl: stats.realizedPnl,
      unrealizedPnl: stats.unrealizedPnl,
      netPnl: stats.netPnl,
      totalFees: stats.totalFees,
      winRate: stats.winRate,
    });
  }

  private logSessionSummary(): void {
    const sub = this.wsSubscriber.stats;
    const rec = this.recorder.stats;
    const duration = Date.now() - this.startTime;

    this.logger.info('Session summary', {
      sessionId: this.sessionId,
      durationMs: duration,
      totalFrames: sub.totalFrames,
      frameCounts: sub.frameCounts,
      sessionEvents: rec.eventCount,
      reconnects: rec.reconnectCount,
      markets: this.subscribedMarketNames,
    });
  }
}
