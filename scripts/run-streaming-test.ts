/**
 * Runs a real streaming session for a fixed duration, then stops cleanly.
 * Usage: npx tsx scripts/run-streaming-test.ts [seconds]
 */

import { loadConfig } from '../src/polybot/config/env.js';
import { Orchestrator } from '../src/polybot/runtime/orchestrator.js';

const durationSec = parseInt(process.argv[2] ?? '45', 10);

async function main() {
  const config = loadConfig();
  const orchestrator = new Orchestrator(config);

  await orchestrator.start();

  console.log(`\nStreaming for ${durationSec}s — will auto-stop...`);

  setTimeout(() => {
    console.log('\nTest duration reached, sending SIGINT...');
    process.kill(process.pid, 'SIGINT');
  }, durationSec * 1000);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
