/**
 * Terminal formatting utilities for the health dashboard.
 */

import type { HealthState, ComponentHealth, HealthStatus, StreamingStats, PaperStats } from '../models/health.js';

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

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatStreamingStats(s: StreamingStats): string {
  const lines: string[] = [];

  const wsColor = s.wsState === 'connected' ? COLORS.green
    : s.wsState === 'reconnecting' ? COLORS.yellow
    : COLORS.red;

  lines.push(`${COLORS.bold}=== STREAMING ===${COLORS.reset}`);
  lines.push(`  WS state:        ${wsColor}${s.wsState.toUpperCase()}${COLORS.reset}`);
  lines.push(`  Assets:          ${s.subscribedAssets}`);
  lines.push(`  Frames:          ${COLORS.cyan}${s.totalFrames}${COLORS.reset}  (${Object.entries(s.frameCounts).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'})`);

  if (s.lastFrameAt) {
    const ago = Math.floor((Date.now() - new Date(s.lastFrameAt).getTime()) / 1000);
    const ageColor = ago < 30 ? COLORS.green : ago < 60 ? COLORS.yellow : COLORS.red;
    lines.push(`  Last frame:      ${ageColor}${ago}s ago${COLORS.reset}`);
  } else {
    lines.push(`  Last frame:      ${COLORS.dim}(none)${COLORS.reset}`);
  }

  lines.push(`  Reconnects:      ${s.reconnectCount > 0 ? COLORS.yellow + s.reconnectCount + COLORS.reset : '0'}`);
  lines.push(`  Session events:  ${s.sessionEvents}`);
  lines.push(`  Uptime:          ${formatDuration(s.sessionDurationMs)}`);

  return lines.join('\n');
}

function formatPaperStats(p: PaperStats): string {
  const lines: string[] = [];
  lines.push(`${COLORS.bold}=== PAPER TRADING ===${COLORS.reset}`);

  // Balance and P&L
  const pnlColor = p.netPnl >= 0 ? COLORS.green : COLORS.red;
  const pnlSign = p.netPnl >= 0 ? '+' : '';
  lines.push(`  Cash:            $${p.cashBalance.toFixed(2)} / $${p.initialBalance.toFixed(2)}`);
  lines.push(`  Net P&L:         ${pnlColor}${pnlSign}$${p.netPnl.toFixed(4)}${COLORS.reset}  (realized: ${pnlSign}$${p.realizedPnl.toFixed(4)}, unrealized: ${p.unrealizedPnl >= 0 ? '+' : ''}$${p.unrealizedPnl.toFixed(4)})`);
  lines.push(`  Fees paid:       $${p.totalFees.toFixed(4)}`);

  // Positions and trades
  lines.push(`  Positions:       ${p.openPositions} open`);
  lines.push(`  Trades:          ${COLORS.cyan}${p.totalTrades}${COLORS.reset}  (win rate: ${(p.winRate * 100).toFixed(0)}%)`);

  // Pipeline stats
  lines.push(`  Signals:         ${p.signalsGenerated}  fills: ${p.fillsExecuted}  rejects: ${p.rejectsCount}`);
  lines.push(`  Books tracked:   ${p.booksTracked}  frames: ${p.framesProcessed}`);

  return lines.join('\n');
}

export function formatHealthReport(health: HealthStatus): string {
  const lines: string[] = [
    '',
    `${COLORS.bold}=== POLYBOT HEALTH ===${COLORS.reset}  ${formatState(health.overall)}  ${COLORS.dim}${health.checkedAt}${COLORS.reset}`,
    `${COLORS.dim}${'─'.repeat(70)}${COLORS.reset}`,
    ...health.components.map(formatComponent),
    `${COLORS.dim}${'─'.repeat(70)}${COLORS.reset}`,
  ];

  if (health.streaming) {
    lines.push('');
    lines.push(formatStreamingStats(health.streaming));
    lines.push(`${COLORS.dim}${'─'.repeat(70)}${COLORS.reset}`);
  }

  if (health.paper) {
    lines.push('');
    lines.push(formatPaperStats(health.paper));
    lines.push(`${COLORS.dim}${'─'.repeat(70)}${COLORS.reset}`);
  }

  lines.push('');
  return lines.join('\n');
}
