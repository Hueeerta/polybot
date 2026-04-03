# Current State

**Last updated:** 2026-04-02
**Branch:** `feat/bootstrap` (from `develop`)
**Last commit:** `d8d103b` — minimal readonly bootstrap
**Tag:** `v0.0.0` on `main` (governance-only, pre-code)

## What's working

- TypeScript project compiles clean (`npx tsc --noEmit`)
- 11/11 tests pass (smoke: config, models; transport: ws-probe; api: gamma-adapter)
- Domain models defined, independent of any SDK
- API adapters (Gamma, CLOB) use raw `fetch`, with rate limiting and retry
- WebSocket transport with reconnect and health probe (`ws` package)
- JSONL recorder with session metadata
- Structured JSON logger
- Terminal health dashboard
- Graceful shutdown handler (SIGINT/SIGTERM)
- Standalone scripts: `npm run probe:ws`, `npm run probe:markets`

## What's NOT done yet

- Scripts not tested against real Polymarket APIs (only mock tests so far)
- Dashboard not tested with live data
- Recorder not tested with real sessions
- `feat/bootstrap` not merged to `develop` yet
- No integration smoke test against real endpoints
- `node_modules/` exists but `.env` does not (needs copy from `.env.example`)

## Next 3 steps

1. **Merge `feat/bootstrap` → `develop`** after confirming probe scripts work against real APIs
2. **Run `npm run probe:ws` and `npm run probe:markets`** to validate transport and adapters with real Polymarket endpoints
3. **Run the orchestrator** (`npx tsx src/polybot/index.ts`) to verify end-to-end: config → probes → dashboard → recorder → shutdown
