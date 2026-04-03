import { config as loadDotenv } from 'dotenv';
import { Config, DEFAULTS, PAPER_CONFIG_DEFAULTS, RuntimeMode } from './schema.js';

/**
 * Load configuration from environment variables, falling back to defaults.
 * Supports readonly and paper modes. Live mode is blocked (ADR-0002).
 */
export function loadConfig(): Config {
  loadDotenv();

  const mode = (process.env.POLYBOT_MODE ?? DEFAULTS.mode) as RuntimeMode;

  if (mode === 'live') {
    throw new Error(
      'Mode "live" is blocked until security audit (ADR-0002). Use "readonly" or "paper".'
    );
  }

  if (mode !== 'readonly' && mode !== 'paper') {
    throw new Error(`Unknown mode "${mode}". Valid modes: readonly, paper.`);
  }

  return {
    mode,
    gamma: {
      baseUrl: process.env.POLYBOT_GAMMA_BASE_URL ?? DEFAULTS.gamma.baseUrl,
      rateLimitRps: parseInt(process.env.POLYBOT_GAMMA_RATE_LIMIT_RPS ?? '', 10) || DEFAULTS.gamma.rateLimitRps,
    },
    clob: {
      baseUrl: process.env.POLYBOT_CLOB_BASE_URL ?? DEFAULTS.clob.baseUrl,
      rateLimitRps: parseInt(process.env.POLYBOT_CLOB_RATE_LIMIT_RPS ?? '', 10) || DEFAULTS.clob.rateLimitRps,
    },
    ws: {
      url: process.env.POLYBOT_WS_URL ?? DEFAULTS.ws.url,
      reconnectDelayMs: parseInt(process.env.POLYBOT_WS_RECONNECT_DELAY_MS ?? '', 10) || DEFAULTS.ws.reconnectDelayMs,
      reconnectMaxDelayMs: parseInt(process.env.POLYBOT_WS_RECONNECT_MAX_DELAY_MS ?? '', 10) || DEFAULTS.ws.reconnectMaxDelayMs,
      pingIntervalMs: parseInt(process.env.POLYBOT_WS_PING_INTERVAL_MS ?? '', 10) || DEFAULTS.ws.pingIntervalMs,
    },
    streaming: {
      marketCount: parseInt(process.env.POLYBOT_STREAMING_MARKET_COUNT ?? '', 10) || DEFAULTS.streaming.marketCount,
      customFeatureEnabled: process.env.POLYBOT_STREAMING_CUSTOM_FEATURE === 'true' || DEFAULTS.streaming.customFeatureEnabled,
    },
    recorder: {
      dir: process.env.POLYBOT_RECORDER_DIR ?? DEFAULTS.recorder.dir,
      maxFileSizeMb: parseInt(process.env.POLYBOT_RECORDER_MAX_FILE_SIZE_MB ?? '', 10) || DEFAULTS.recorder.maxFileSizeMb,
    },
    log: {
      level: (process.env.POLYBOT_LOG_LEVEL ?? DEFAULTS.log.level) as Config['log']['level'],
      dir: process.env.POLYBOT_LOG_DIR ?? DEFAULTS.log.dir,
    },
    ...(mode === 'paper' ? {
      paper: {
        initialBalanceUsdc: parseFloat(process.env.POLYBOT_PAPER_INITIAL_BALANCE ?? '') || PAPER_CONFIG_DEFAULTS.initialBalanceUsdc,
        maxPositionSizeUsdc: parseFloat(process.env.POLYBOT_PAPER_MAX_POSITION_SIZE ?? '') || PAPER_CONFIG_DEFAULTS.maxPositionSizeUsdc,
        maxOpenPositions: parseInt(process.env.POLYBOT_PAPER_MAX_OPEN_POSITIONS ?? '', 10) || PAPER_CONFIG_DEFAULTS.maxOpenPositions,
        takerFeeBps: parseInt(process.env.POLYBOT_PAPER_TAKER_FEE_BPS ?? '', 10) ?? PAPER_CONFIG_DEFAULTS.takerFeeBps,
        tickSize: parseFloat(process.env.POLYBOT_PAPER_TICK_SIZE ?? '') || PAPER_CONFIG_DEFAULTS.tickSize,
        minOrderSize: parseFloat(process.env.POLYBOT_PAPER_MIN_ORDER_SIZE ?? '') || PAPER_CONFIG_DEFAULTS.minOrderSize,
        staleBookThresholdMs: parseInt(process.env.POLYBOT_PAPER_STALE_BOOK_MS ?? '', 10) || PAPER_CONFIG_DEFAULTS.staleBookThresholdMs,
      },
    } : {}),
  };
}
