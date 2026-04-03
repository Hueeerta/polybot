/**
 * Typed configuration schema with defaults.
 * Runtime mode is enforced at the type level.
 */

export type RuntimeMode = 'readonly' | 'paper' | 'live';

export interface GammaConfig {
  baseUrl: string;
  rateLimitRps: number;
}

export interface ClobConfig {
  baseUrl: string;
  rateLimitRps: number;
}

export interface WsConfig {
  url: string;
  reconnectDelayMs: number;
  reconnectMaxDelayMs: number;
  pingIntervalMs: number;
}

export interface RecorderConfig {
  dir: string;
  maxFileSizeMb: number;
}

export interface LogConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  dir: string;
}

export interface StreamingConfig {
  /** Number of top markets to subscribe to */
  marketCount: number;
  /** Enable best_bid_ask custom feature */
  customFeatureEnabled: boolean;
}

export interface PaperConfig {
  initialBalanceUsdc: number;
  maxPositionSizeUsdc: number;
  maxOpenPositions: number;
  /** Taker fee in basis points applied to grossAmount per fill */
  takerFeeBps: number;
  tickSize: number;
  minOrderSize: number;
  staleBookThresholdMs: number;
}

export interface Config {
  mode: RuntimeMode;
  gamma: GammaConfig;
  clob: ClobConfig;
  ws: WsConfig;
  streaming: StreamingConfig;
  recorder: RecorderConfig;
  log: LogConfig;
  /** Only present when mode === 'paper'. */
  paper?: PaperConfig;
}

export const PAPER_CONFIG_DEFAULTS: PaperConfig = {
  initialBalanceUsdc: 1000,
  maxPositionSizeUsdc: 100,
  maxOpenPositions: 5,
  takerFeeBps: 200,
  tickSize: 0.01,
  minOrderSize: 1,
  staleBookThresholdMs: 30_000,
};

export const DEFAULTS: Config = {
  mode: 'readonly',
  gamma: {
    baseUrl: 'https://gamma-api.polymarket.com',
    rateLimitRps: 2,
  },
  clob: {
    baseUrl: 'https://clob.polymarket.com',
    rateLimitRps: 5,
  },
  ws: {
    url: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
    reconnectDelayMs: 1000,
    reconnectMaxDelayMs: 30000,
    pingIntervalMs: 10000,
  },
  streaming: {
    marketCount: 3,
    customFeatureEnabled: false,
  },
  recorder: {
    dir: 'data/recordings',
    maxFileSizeMb: 50,
  },
  log: {
    level: 'info',
    dir: 'logs',
  },
};
