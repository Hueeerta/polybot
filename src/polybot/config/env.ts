import { config as loadDotenv } from 'dotenv';
import { Config, DEFAULTS, RuntimeMode } from './schema.js';

/**
 * Load configuration from environment variables, falling back to defaults.
 * Enforces readonly mode — paper and live are not implemented.
 */
export function loadConfig(): Config {
  loadDotenv();

  const mode = (process.env.POLYBOT_MODE ?? DEFAULTS.mode) as RuntimeMode;

  if (mode !== 'readonly') {
    throw new Error(
      `Mode "${mode}" is not implemented. Only "readonly" is available in this stage.`
    );
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
    recorder: {
      dir: process.env.POLYBOT_RECORDER_DIR ?? DEFAULTS.recorder.dir,
      maxFileSizeMb: parseInt(process.env.POLYBOT_RECORDER_MAX_FILE_SIZE_MB ?? '', 10) || DEFAULTS.recorder.maxFileSizeMb,
    },
    log: {
      level: (process.env.POLYBOT_LOG_LEVEL ?? DEFAULTS.log.level) as Config['log']['level'],
      dir: process.env.POLYBOT_LOG_DIR ?? DEFAULTS.log.dir,
    },
  };
}
