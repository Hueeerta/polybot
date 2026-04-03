/**
 * Session metadata — captures context for each run.
 */

import { execSync } from 'node:child_process';
import type { Config } from '../config/schema.js';

export interface SessionMeta {
  sessionId: string;
  startedAt: string;
  gitCommit: string;
  mode: string;
  config: Config;
}

export function createSessionMeta(sessionId: string, config: Config): SessionMeta {
  let gitCommit = 'unknown';
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    // Not a git repo or git not available
  }

  return {
    sessionId,
    startedAt: new Date().toISOString(),
    gitCommit,
    mode: config.mode,
    config,
  };
}
