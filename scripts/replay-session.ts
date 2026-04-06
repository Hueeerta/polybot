/**
 * Replay a recorded JSONL session from disk.
 *
 * Usage:
 *   npx tsx scripts/replay-session.ts <path-to-jsonl> [--filter book,price_change] [--summary]
 *
 * Options:
 *   --filter <types>   Comma-separated event types to show (default: all)
 *   --summary          Only show session meta and summary, skip individual frames
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

interface ReplayOptions {
  file: string;
  filter: string[];
  summaryOnly: boolean;
}

function parseArgs(): ReplayOptions {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: npx tsx scripts/replay-session.ts <file.jsonl> [--filter type1,type2] [--summary]');
    process.exit(0);
  }

  const file = args[0];
  let filter: string[] = [];
  let summaryOnly = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--filter' && args[i + 1]) {
      filter = args[i + 1].split(',').map(s => s.trim());
      i++;
    }
    if (args[i] === '--summary') {
      summaryOnly = true;
    }
  }

  return { file, filter, summaryOnly };
}

function formatFrameType(type: string): string {
  if (type.startsWith('ws_book')) return `${COLORS.cyan}${type}${COLORS.reset}`;
  if (type.startsWith('ws_price_change')) return `${COLORS.yellow}${type}${COLORS.reset}`;
  if (type.startsWith('ws_last_trade')) return `${COLORS.green}${type}${COLORS.reset}`;
  if (type === 'session_meta' || type === 'session_summary') return `${COLORS.bold}${type}${COLORS.reset}`;
  if (type === 'session_end') return `${COLORS.red}${type}${COLORS.reset}`;
  if (type === 'paper_fill') return `${COLORS.green}${type}${COLORS.reset}`;
  if (type === 'paper_rejected') return `${COLORS.red}${type}${COLORS.reset}`;
  if (type === 'paper_signal') return `${COLORS.cyan}${type}${COLORS.reset}`;
  if (type === 'paper_order') return `${COLORS.yellow}${type}${COLORS.reset}`;
  if (type === 'paper_portfolio_snapshot') return `${COLORS.bold}${type}${COLORS.reset}`;
  return type;
}

async function replay(opts: ReplayOptions): Promise<void> {
  const rl = createInterface({
    input: createReadStream(opts.file),
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  let hasMeta = false;
  let hasSummary = false;
  let hasEnd = false;
  let firstTimestamp: string | undefined;
  let lastTimestamp: string | undefined;
  const typeCounts: Record<string, number> = {};

  console.log(`\n${COLORS.bold}=== REPLAY: ${opts.file} ===${COLORS.reset}\n`);

  for await (const line of rl) {
    lineCount++;
    let record: Record<string, unknown>;

    try {
      record = JSON.parse(line);
    } catch {
      console.error(`${COLORS.red}Line ${lineCount}: invalid JSON${COLORS.reset}`);
      continue;
    }

    const type = String(record.type || 'unknown');
    typeCounts[type] = (typeCounts[type] || 0) + 1;

    if (type === 'session_meta') hasMeta = true;
    if (type === 'session_summary') hasSummary = true;
    if (type === 'session_end') hasEnd = true;

    const ts = String(record.timestamp || record.startedAt || '');
    if (ts && !firstTimestamp) firstTimestamp = ts;
    if (ts) lastTimestamp = ts;

    // Always show meta and summary
    if (type === 'session_meta') {
      console.log(`${formatFrameType(type)}`);
      console.log(`  Session:  ${record.sessionId}`);
      console.log(`  Started:  ${record.startedAt}`);
      console.log(`  Mode:     ${(record.config as Record<string, unknown>)?.mode || 'unknown'}`);
      console.log(`  Commit:   ${record.gitCommit || 'unknown'}`);
      console.log('');
      continue;
    }

    if (type === 'session_summary') {
      console.log(`\n${formatFrameType(type)}`);
      console.log(`  Duration:    ${record.durationMs}ms`);
      console.log(`  Events:      ${record.totalEvents}`);
      console.log(`  Reconnects:  ${record.reconnectCount}`);
      const ec = record.eventCounts as Record<string, number> | undefined;
      if (ec) {
        console.log(`  Breakdown:   ${Object.entries(ec).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
      }
      console.log('');
      continue;
    }

    if (type === 'session_end') {
      console.log(`${formatFrameType(type)}  ${ts}`);
      continue;
    }

    if (opts.summaryOnly) continue;

    // Apply filter
    if (opts.filter.length > 0 && !opts.filter.some(f => type.includes(f))) {
      continue;
    }

    // Print frame
    const payload = record.payload as Record<string, unknown> | undefined;
    const source = record.source || '';
    const brief = briefPayload(type, payload);

    console.log(`${COLORS.dim}${ts}${COLORS.reset}  ${formatFrameType(type)}  ${COLORS.dim}[${source}]${COLORS.reset}  ${brief}`);
  }

  // Integrity check
  console.log(`\n${COLORS.bold}=== INTEGRITY ===${COLORS.reset}`);
  console.log(`  Lines:     ${lineCount}`);
  console.log(`  Has meta:  ${hasMeta ? COLORS.green + 'yes' : COLORS.red + 'NO'}${COLORS.reset}`);
  console.log(`  Has summary: ${hasSummary ? COLORS.green + 'yes' : COLORS.yellow + 'no'}${COLORS.reset}`);
  console.log(`  Has end:   ${hasEnd ? COLORS.green + 'yes' : COLORS.red + 'NO'}${COLORS.reset}`);
  console.log(`  Types:     ${Object.entries(typeCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}`);

  if (firstTimestamp && lastTimestamp) {
    const dur = new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime();
    console.log(`  Span:      ${Math.floor(dur / 1000)}s`);
  }

  const valid = hasMeta && hasEnd;
  console.log(`\n${valid ? COLORS.green + 'SESSION VALID' : COLORS.red + 'SESSION INCOMPLETE'}${COLORS.reset}\n`);

  process.exit(valid ? 0 : 1);
}

function briefPayload(type: string, payload: Record<string, unknown> | undefined): string {
  if (!payload) return '';

  if (type === 'ws_book') {
    const bids = Array.isArray(payload.bids) ? payload.bids.length : '?';
    const asks = Array.isArray(payload.asks) ? payload.asks.length : '?';
    return `${bids} bids, ${asks} asks`;
  }

  if (type === 'ws_price_change') {
    const changes = payload.price_changes;
    if (Array.isArray(changes) && changes.length > 0) {
      const c = changes[0] as Record<string, unknown>;
      return `${c.side} ${c.price} x${c.size}`;
    }
    return '';
  }

  if (type === 'ws_last_trade_price') {
    return `${payload.side} ${payload.price} x${payload.size}`;
  }

  if (type === 'market_discovered') {
    return String(payload.slug || payload.question || '');
  }

  if (type === 'health_check') {
    const h = payload as Record<string, unknown>;
    return String(h.overall || '');
  }

  if (type === 'paper_signal') {
    return `${payload.side} ${payload.sizeShares}sh ${payload.tokenId?.toString().slice(0, 12)}.. [${payload.signalSource}]`;
  }

  if (type === 'paper_fill') {
    const fill = payload.fill as Record<string, unknown> | undefined;
    const intent = payload.intent as Record<string, unknown> | undefined;
    if (fill && intent) {
      return `${fill.side} ${fill.filledSize}sh @${Number(fill.effectivePrice).toFixed(4)} fee=$${Number(fill.takerFee).toFixed(4)} ${fill.status}`;
    }
    return '';
  }

  if (type === 'paper_rejected') {
    const fill = payload.fill as Record<string, unknown> | undefined;
    return fill ? `REJECTED: ${fill.rejectReason}` : 'REJECTED';
  }

  if (type === 'paper_order') {
    return `${payload.side} ${payload.sizeShares}sh ${payload.tokenId?.toString().slice(0, 12)}..`;
  }

  if (type === 'paper_portfolio_snapshot') {
    const stats = payload.stats as Record<string, unknown> | undefined;
    return `cash=$${Number(payload.cashBalance).toFixed(2)} trades=${stats?.totalTrades} pnl=$${Number(stats?.netPnl).toFixed(4)}`;
  }

  return '';
}

const opts = parseArgs();
replay(opts);
