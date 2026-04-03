# MVP Read-Only Plan

**Date:** 2026-04-02
**Status:** Active
**Stage:** 1 of 7 (Read-only transport and observability)

## Objective

Build a local-first, terminal-based system that can discover, observe, and record Polymarket market data without executing any trades, signing any transactions, or connecting any wallet.

## Success criteria

The MVP is successful when it can:
1. Discover active markets via Gamma API
2. Fetch orderbook data via CLOB API
3. Connect to WebSocket feeds and receive real-time updates
4. Display market state in a terminal dashboard
5. Log structured events with enough context for debugging
6. Save snapshots to disk for offline replay
7. Run health checks on all transport connections
8. Shut down gracefully without data loss

## Non-goals

- Trading (real or simulated)
- Wallet integration
- Signing or authentication with CLOB
- Probability modeling or strategy research
- Performance optimization
- Multi-exchange support

## Planned components

### 1. Config (`src/polybot/config/`)
- Typed configuration with defaults
- Environment variable loading
- Feature flags (readonly enforced, paper/live disabled)
- Runtime mode enum: `readonly | paper | live`

### 2. API clients (`src/polybot/api/`)
- `GammaClient` — market discovery, metadata, search
- `ClobClient` — orderbook snapshots, market info (read-only)
- Rate limiting and retry logic
- Response type definitions

### 3. Transport (`src/polybot/transport/`)
- WebSocket connection manager
- Subscription lifecycle (subscribe/unsubscribe)
- Reconnection with exponential backoff
- Health probe (is connection alive? last message timestamp?)
- Heartbeat monitoring

### 4. Models (`src/polybot/models/`)
- `Market` — question, slug, outcomes, tokens, status
- `Outcome` — label, token_id, price
- `OrderbookSnapshot` — bids, asks, spread, mid price, timestamp
- `Event` — generic event envelope for recording

### 5. Recorder (`src/polybot/recorder/`)
- Save snapshots to local JSON/JSONL files
- Session metadata (start time, commit, config)
- Append-only event log per session
- Rotation or size limits

### 6. UI (`src/polybot/ui/`)
- Terminal dashboard showing:
  - Active markets being watched
  - Current prices / spreads
  - Connection health status
  - Event count / throughput
  - Last error if any
- Session summary on exit

### 7. Runtime (`src/polybot/runtime/`)
- Main orchestrator
- Graceful shutdown handler (SIGINT, SIGTERM)
- Session lifecycle
- Component health aggregation

### 8. Logging (`src/polybot/logging/`)
- Structured JSON logging
- Log levels: debug, info, warn, error
- Context injection (session_id, component, market)
- File + stdout output

## Architecture boundaries

```
                    ┌─────────────┐
                    │   Config    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼───┐ ┌─────▼─────┐
        │ API Client │ │  WS   │ │  Recorder │
        │ (Gamma,    │ │Transport│ │ (snapshots│
        │  CLOB)     │ │       │ │  events)  │
        └─────┬──────┘ └───┬───┘ └─────┬─────┘
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────▼──────┐
                    │   Runtime   │
                    │ orchestrator│
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   UI / CLI  │
                    │  dashboard  │
                    └─────────────┘
```

## Future boundaries (defined now, implemented later)

### Paper mode interface
```typescript
interface PaperExecutor {
  placeOrder(order: PaperOrder): Promise<PaperFill>;
  getBalance(): PaperBalance;
  getPositions(): PaperPosition[];
}
```
Not implemented in this stage. Only the interface contract exists.

### Live mode interface
```typescript
interface LiveExecutor {
  placeOrder(order: SignedOrder): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<void>;
}
```
Not implemented. Blocked by ADR-0002 (security audit required).

## Implementation order

1. ~~Config + models (types and configuration)~~ — DONE (d8d103b)
2. ~~Gamma API client (market discovery)~~ — DONE (d8d103b)
3. ~~CLOB API client (orderbook read)~~ — DONE (d8d103b)
4. ~~WebSocket transport (real-time feed)~~ — DONE (d8d103b)
5. ~~Recorder (snapshot persistence)~~ — DONE (d8d103b)
6. ~~Logging infrastructure~~ — DONE (d8d103b)
7. ~~Runtime orchestrator~~ — DONE (d8d103b)
8. ~~Terminal UI dashboard~~ — DONE (d8d103b)
9. ~~Health checks and graceful shutdown~~ — DONE (d8d103b)
10. Integration smoke test — PENDING (run probes against real APIs)

## Risk register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Polymarket API changes without notice | High | Pin SDK versions, record raw responses |
| WebSocket instability | Medium | Reconnect logic, health probes, alerts |
| Rate limiting | Medium | Built-in rate limiter, backoff |
| Data volume overwhelms local storage | Low | Rotation, size limits, JSONL format |
| Scope creep into paper/live | High | Feature flags, ADR enforcement, code review |

## Definition of done

- [ ] All 8 components implemented and tested
- [ ] Can run `npx polybot --mode readonly` from terminal
- [ ] Dashboard shows live market data
- [ ] Snapshots saved to `data/` directory
- [ ] Logs written in structured JSON
- [ ] Health check reports connection status
- [ ] Clean shutdown on Ctrl+C
- [ ] Tagged as `v0.1.0`
