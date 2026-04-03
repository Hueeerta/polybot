# Current State

**Last updated:** 2026-04-03
**Branch:** `develop` (Stage 1.5 merged)
**Tags:** `v0.1.0-readonly` (baseline)

## What's validated against production Polymarket

### Stage 1 (read-only MVP)
- Gamma API: market discovery with camelCase fields, volume-sorted, closed=false
- CLOB API: real orderbook fetch (bids, asks, midPrice, spread)
- WebSocket: real `book` frame via decimal token ID subscription

### Stage 1.5 (streaming + replay)
- 45s real streaming session: 60 frames (6 book + 54 price_change), 3 markets
- Text PING keepalive every 10s, PONG responses received
- Frame classification: book, price_change, last_trade_price
- JSONL recorder: session_meta, events, session_summary, session_end
- Replay: integrity check passed (valid session)
- Dashboard: live streaming stats (WS state, frames, age, reconnects, uptime)
- Clean shutdown: session summary logged, recorder flushed, exit 0
- 20/20 tests pass, typecheck clean

## Key protocol findings

- `assets_ids` requires **decimal** token IDs (76+ digit numbers), NOT hex condition IDs
- Server returns `[]` silently for unrecognized IDs (no error)
- `initial_dump: true` triggers immediate `book` snapshot
- Keepalive: send text `"PING"` (not WS ping frame), server replies `"PONG"`
- Market channel event types: `book`, `price_change`, `last_trade_price`, `tick_size_change`, `best_bid_ask`

## Completed milestones

- `v0.0.0` — governance foundation (ADRs, context, constraints)
- `v0.1.0-readonly` — validated read-only MVP
- Stage 1.5 — real-time streaming, recorder, replay (pending tag)

## Next steps

1. Longer soak test (10+ minutes) to validate stability
2. Stage 2 planning — paper trading architecture
