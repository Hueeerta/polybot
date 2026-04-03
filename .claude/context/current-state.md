# Current State

**Last updated:** 2026-04-03
**Branch:** `main` (develop merged)
**Tag:** `v0.1.0-readonly` on `develop` (baseline)

## What's validated against production Polymarket

- Gamma API: market discovery with camelCase fields, volume-sorted, closed=false
- CLOB API: real orderbook fetch (bids, asks, midPrice, spread)
- WebSocket: real `book` frame via decimal token ID subscription (`assets_ids`)
- JSONL recorder: full session captured (session_meta → market → orderbook → ws_frame → session_end)
- Graceful shutdown: clean exit, recorder flushed, exit code 0
- 11/11 tests pass, typecheck clean

## Key protocol findings

- `assets_ids` requires **decimal** token IDs (76+ digit numbers), NOT hex condition IDs
- Server returns `[]` silently for unrecognized IDs (no error)
- `initial_dump: true` triggers immediate `book` snapshot
- Keepalive: send text `"PING"` (not WS ping frame), server replies `"PONG"`
- Market channel event types: `book`, `price_change`, `last_trade_price`, `tick_size_change`, `best_bid_ask`

## Completed milestones

- `v0.0.0` — governance foundation (ADRs, context, constraints)
- `v0.1.0-readonly` — validated read-only MVP (all data flows verified against prod)

## Next: Stage 1.5

Streaming, reconnect, recorder, replay — before paper trading.
See `.claude/plans/2026-04-03-stage-1.5-streaming.md`
