/**
 * Standalone market discovery — fetches active markets from Gamma API.
 * Usage: npx tsx scripts/discover-markets.ts [limit]
 */

import { GammaAdapter } from '../src/polybot/api/gamma-adapter.js';

const limit = parseInt(process.argv[2] ?? '5', 10);

console.log(`Discovering markets (limit=${limit})...`);

const gamma = new GammaAdapter({
  baseUrl: 'https://gamma-api.polymarket.com',
  rateLimitRps: 2,
});

const markets = await gamma.getMarkets({ limit, active: true });

for (const m of markets) {
  const outcomes = m.outcomes
    .map(o => `${o.label} (${o.tokenId.slice(0, 8)}...)`)
    .join(' / ');
  console.log(`\n[${m.slug}]`);
  console.log(`  Q: ${m.question}`);
  console.log(`  Outcomes: ${outcomes}`);
  console.log(`  Active: ${m.active}`);
  if (m.volumeUsd) console.log(`  Volume: $${m.volumeUsd.toLocaleString()}`);
}

console.log(`\n${markets.length} markets found.`);
