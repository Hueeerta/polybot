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

export interface Config {
  mode: RuntimeMode;
  gamma: GammaConfig;
  clob: ClobConfig;
  ws: WsConfig;
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
    pingIntervalMs: 30000,
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
