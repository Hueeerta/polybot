/**
 * Standalone WebSocket probe — tests connectivity to Polymarket WS endpoint.
 * Usage: npx tsx scripts/probe-ws.ts [url]
 */

import { WsProbe } from '../src/polybot/transport/ws-probe.js';

const url = process.argv[2] ?? 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

console.log(`Probing WebSocket: ${url}`);

const probe = new WsProbe(url);
const result = await probe.probe();

console.log(JSON.stringify(result, null, 2));
process.exit(result.reachable ? 0 : 1);
