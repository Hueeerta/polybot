/**
 * Polybot entry point.
 * Loads config, enforces readonly mode, starts orchestrator.
 */

import { loadConfig } from './config/index.js';
import { Orchestrator } from './runtime/index.js';

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.mode !== 'readonly' && config.mode !== 'paper') {
    process.stderr.write(`Error: mode "${config.mode}" is not implemented.\n`);
    process.stderr.write('Only "readonly" and "paper" modes are available.\n');
    process.exit(1);
  }

  const orchestrator = new Orchestrator(config);
  await orchestrator.start();
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
