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

export interface Config {
  mode: RuntimeMode;
  gamma: GammaConfig;
  clob: ClobConfig;
  ws: WsConfig;
  streaming: StreamingConfig;
  recorder: RecorderConfig;
  log: LogConfig;
}

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
