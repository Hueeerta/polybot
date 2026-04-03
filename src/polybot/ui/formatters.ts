/**
 * Terminal formatting utilities for the health dashboard.
 */

import type { HealthState, ComponentHealth, HealthStatus } from '../models/health.js';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export function colorForState(state: HealthState): string {
  switch (state) {
    case 'healthy': return COLORS.green;
    case 'degraded': return COLORS.yellow;
    case 'unhealthy': return COLORS.red;
    default: return COLORS.gray;
  }
}

export function formatState(state: HealthState): string {
  const color = colorForState(state);
  return `${color}${state.toUpperCase()}${COLORS.reset}`;
}

export function formatComponent(c: ComponentHealth): string {
  const status = formatState(c.state);
  const latency = c.latencyMs !== undefined ? `${c.latencyMs}ms` : '-';
  const msg = c.message ? ` ${COLORS.dim}(${c.message})${COLORS.reset}` : '';
  return `  ${c.name.padEnd(20)} ${status.padEnd(30)} ${latency.padStart(8)}${msg}`;
}

export function formatHealthReport(health: HealthStatus): string {
  const lines: string[] = [
    '',
    `${COLORS.bold}=== POLYBOT HEALTH ===${COLORS.reset}  ${formatState(health.overall)}  ${COLORS.dim}${health.checkedAt}${COLORS.reset}`,
    `${COLORS.dim}${'─'.repeat(70)}${COLORS.reset}`,
    ...health.components.map(formatComponent),
    `${COLORS.dim}${'─'.repeat(70)}${COLORS.reset}`,
    '',
  ];
  return lines.join('\n');
}
