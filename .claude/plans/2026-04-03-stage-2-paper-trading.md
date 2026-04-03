# Stage 2 — Paper Trading

**Date:** 2026-04-03
**Status:** PLANNING
**Stage:** 2 of 7
**Depends on:** Stage 1.5 (v0.2.0-streaming) — COMPLETE

---

## 1. Objective

Paper trading is a simulation layer that processes buy/sell signals against **real market data** but executes them in a **virtual portfolio** with **no real wallet, no signing, and no funds at risk**.

Its purpose is narrow and specific:
- Validate that order flow logic (signal → order → fill → position → P&L) works correctly end-to-end.
- Expose bugs in fill assumptions, position tracking, and balance accounting **before** real money is involved.
- Produce a recorded session that can be replayed and audited to evaluate whether the bot's decisions were sound.

Paper trading is NOT:
- A strategy research tool (strategies are defined elsewhere and plugged in via `SignalProvider`).
- A backtesting engine (replay of historical data is Stage 1.5; paper mode runs against live streams).
- A proof that the bot is profitable (that requires analysis of recorded paper sessions).

---

## 2. Architecture

### 2.1 Where paper modules live

```
src/polybot/paper/
├── types.ts              # Port interfaces: PaperExecutor, PaperPortfolio, PaperFillEngine, SignalProvider
├── portfolio.ts          # InMemoryPortfolio — tracks balances, positions, P&L
├── fill-engine.ts        # OrderbookFillEngine — simulates fills against real orderbook
├── executor.ts           # PaperExecutor — orchestrates signal → order → fill → portfolio update
├── models.ts             # PaperOrder, PaperFill, PaperPosition, PaperBalance, Signal, etc.
└── index.ts              # Public exports
```

Paper modules live in their own top-level directory. They are **consumers** of readonly data, never producers. They do not modify, wrap, or extend anything in `api/`, `transport/`, or `recorder/`.

### 2.2 Interaction with existing components

```
┌─────────────────────────────────────────────────────────────┐
│                    READONLY LAYER (existing)                │
│                                                             │
│  WsSubscriber ──onFrame()──▶ Recorder (JSONL)              │
│       │                                                     │
│       │ onFrame() (second handler)                          │
│       ▼                                                     │
│  ┌─────────────┐                                            │
│  │ OrderbookAgg│  Maintains latest OrderbookSnapshot        │
│  │ (new, thin) │  per token from ws_book frames             │
│  └──────┬──────┘                                            │
│         │                                                   │
└─────────┼───────────────────────────────────────────────────┘
          │ getOrderbook(tokenId)
          ▼
┌─────────────────────────────────────────────────────────────┐
│                     PAPER LAYER (new)                       │
│                                                             │
│  SignalProvider ──▶ PaperExecutor ──▶ PaperFillEngine       │
│  (pluggable)        │                    │                  │
│                     │                    │ queries latest   │
│                     │                    │ orderbook from   │
│                     │                    │ OrderbookAgg     │
│                     ▼                    ▼                  │
│               PaperPortfolio ◀── PaperFill result           │
│               (balances, positions, P&L)                    │
│                     │                                       │
│                     ▼                                       │
│               Recorder (paper events → JSONL)               │
└─────────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**

1. **No event bus.** The WsSubscriber already supports multiple `onFrame()` handlers. Paper trading registers as a second handler alongside the recorder. This is the simplest coupling that works — adding an event bus is premature abstraction for a system with two consumers.

2. **OrderbookAgg is a thin in-memory cache.** It listens to `ws_book` frames and maintains the latest `OrderbookSnapshot` per tokenId. The fill engine queries it synchronously. This component is small enough to live in `src/polybot/paper/` or `src/polybot/transport/` — decision deferred to implementation, but it must not depend on paper-specific types.

3. **SignalProvider is a port interface.** Stage 2 ships with a single trivial implementation (`ManualSignalProvider` or `RandomSignalProvider` for testing). Real strategies are Stage 3+. The point is to prove the pipeline, not the alpha.

4. **Paper events are recorded to the same JSONL session.** No separate file. Paper orders, fills, and P&L snapshots are `DomainEvent` entries with new `EventType` values. This means replay can show the full picture: market data + paper decisions + outcomes.

### 2.3 Module boundary rules

| Rule | Rationale |
|------|-----------|
| Paper modules MUST NOT import from `api/` adapters directly | Paper consumes data via ports, not concrete HTTP clients |
| Paper modules MUST NOT send any network request | No wallet, no signing, no HTTP calls — simulation only |
| Paper modules MUST NOT hold references to WsConnection | They receive data through onFrame callbacks, not raw WS |
| The orchestrator decides whether paper layer is wired | Based on `config.mode === 'paper'` — paper modules are never instantiated in readonly mode |
| Paper events use the existing `EventRecorder` port | No new persistence mechanism |

---

## 3. Key interfaces

### 3.1 Domain models (`paper/models.ts`)

```typescript
type OrderSide = 'buy' | 'sell';
type OrderType = 'market' | 'limit';
type FillStatus = 'filled' | 'partial' | 'rejected';

interface Signal {
  id: string;
  tokenId: string;
  conditionId: string;
  side: OrderSide;
  /** Desired size in outcome tokens */
  size: number;
  /** For limit orders: max/min price. Absent for market orders. */
  limitPrice?: number;
  reason: string;
  generatedAt: string;
}

interface PaperOrder {
  id: string;
  signalId: string;
  tokenId: string;
  side: OrderSide;
  type: OrderType;
  size: number;
  limitPrice?: number;
  createdAt: string;
}

interface PaperFill {
  orderId: string;
  status: FillStatus;
  filledSize: number;
  avgPrice: number;
  /** Total cost/proceeds in USDC */
  totalUsdc: number;
  /** Slippage from mid price at time of fill */
  slippageBps: number;
  filledAt: string;
  /** Reason if rejected */
  rejectReason?: string;
}

interface PaperPosition {
  tokenId: string;
  conditionId: string;
  side: OrderSide;
  size: number;
  avgEntryPrice: number;
  /** Current market price (from latest orderbook) */
  currentPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
}

interface PaperBalance {
  /** Starting capital for this session */
  initialUsdc: number;
  /** Current available USDC (after open positions) */
  availableUsdc: number;
  /** USDC locked in open positions */
  lockedUsdc: number;
  /** Total P&L (realized + unrealized) */
  totalPnl: number;
  /** Timestamp of last update */
  updatedAt: string;
}
```

### 3.2 Port interfaces (`paper/types.ts`)

```typescript
interface SignalProvider {
  /** Called on each relevant WS frame. May return 0 or more signals. */
  evaluate(frame: WsFrame, portfolio: PaperPortfolio): Signal[];
}

interface PaperFillEngine {
  /**
   * Simulate filling an order against the current orderbook.
   * Returns a fill result (filled, partial, or rejected).
   */
  tryFill(order: PaperOrder): PaperFill;
}

interface PaperPortfolio {
  /** Current cash balance and summary */
  getBalance(): PaperBalance;
  /** All open positions */
  getPositions(): PaperPosition[];
  /** Apply a fill to update balances and positions */
  applyFill(order: PaperOrder, fill: PaperFill): void;
  /** Recalculate unrealized P&L based on current prices */
  markToMarket(prices: Map<string, number>): void;
  /** Full session trade history */
  getFillHistory(): PaperFill[];
}

interface PaperExecutor {
  /** Process a signal: create order, attempt fill, update portfolio */
  execute(signal: Signal): PaperFill;
  /** Get current portfolio state */
  readonly portfolio: PaperPortfolio;
}
```

### 3.3 Design notes on interfaces

- `SignalProvider.evaluate()` receives the current portfolio so it can make position-aware decisions (e.g., don't buy if already at max exposure). This is intentional — even a trivial signal provider needs to know current state to avoid nonsensical behavior.
- `PaperFillEngine.tryFill()` is synchronous. It reads the latest orderbook from the in-memory aggregator. No async needed because there is no I/O.
- `PaperPortfolio.markToMarket()` is called periodically (e.g., every N seconds or every book frame) to update unrealized P&L. It does not trigger fills.

---

## 4. Design decisions

### 4.1 How does paper trading consume the WS stream?

**Decision:** Direct `onFrame()` callback registration on WsSubscriber.

The WsSubscriber already supports multiple handlers via `onFrame()`. The orchestrator registers the paper executor as a second frame handler alongside the existing recorder handler. No event bus, no pub/sub middleware.

**Why not an event bus?** Two consumers (recorder + paper) do not justify the complexity. If Stage 3 adds a third consumer, we can introduce an event bus then. YAGNI applies.

**Flow:**
1. WsSubscriber receives frame
2. Handler 1: Recorder persists frame to JSONL (existing)
3. Handler 2: OrderbookAgg updates latest snapshot (new)
4. Handler 3: Paper executor evaluates signal and attempts fill if signal fires (new)

### 4.2 Where do virtual balances come from?

**Decision:** Config, with sensible defaults.

New config section:
```typescript
interface PaperConfig {
  initialBalanceUsdc: number;    // default: 1000
  maxPositionSizeUsdc: number;   // default: 100
  maxOpenPositions: number;      // default: 5
}
```

Added to `Config` as an optional field (only present when `mode === 'paper'`). CLI override is out of scope for Stage 2 — config file or env vars are sufficient.

**Rationale:** Config is already the single source of truth for all runtime parameters. Adding CLI args for paper config is premature ergonomics.

### 4.3 How are simulated fills determined?

**Decision:** Walk the real orderbook. No immediate-fill shortcuts.

The `OrderbookFillEngine`:
1. Reads the latest `OrderbookSnapshot` for the target tokenId from the in-memory aggregator.
2. For a **buy market order**: walks the ask side, consuming levels until the requested size is filled or liquidity is exhausted.
3. For a **sell market order**: walks the bid side similarly.
4. For a **limit order**: same walk, but stops if the price exceeds the limit.
5. Returns `partial` if the book doesn't have enough depth, `rejected` if there is no liquidity at all or if the order would exceed risk limits.
6. Calculates slippage relative to the mid price at time of fill.

**Why not immediate fill at mid price?** Mid-price fill gives unrealistically optimistic results. It hides slippage, ignores spread, and trains you to trust a simulation that will betray you with real money. Walking the book is more work but produces fills that are closer to reality.

**Known limitation:** This approach still overstates fill probability because:
- It assumes our order doesn't move the market (no market impact).
- It doesn't account for queue priority on limit orders.
- Real fills have latency between decision and execution.

These limitations are acceptable for paper mode. They should be documented in the session metadata so anyone reviewing results knows the simulation's assumptions.

### 4.4 How is P&L tracked?

**Decision:** Per-position and per-session, recorded to the same JSONL file.

- Each `PaperFill` is recorded as a `DomainEvent` with type `paper_fill`.
- Position snapshots are recorded periodically (every 30s or configurable) as `paper_portfolio_snapshot`.
- Session summary includes total P&L, win/loss count, average slippage.

The paper portfolio maintains in-memory state. Persistence is via the JSONL recorder only — no separate database, no separate file.

**New EventType values needed:**
```
paper_signal       — signal generated by SignalProvider
paper_order        — order created from signal
paper_fill         — fill result (filled/partial/rejected)
paper_portfolio_snapshot — periodic portfolio state dump
```

### 4.5 Does paper mode modify the dashboard?

**Decision:** Yes, minimally. Add a paper section below the existing streaming stats.

The dashboard in paper mode shows:
- Everything readonly mode shows (health, streaming stats, frames)
- Plus a `PAPER` section with:
  - Balance: available / locked / total P&L
  - Open positions: tokenId, side, size, entry price, current price, unrealized P&L
  - Last fill: orderId, side, size, price, slippage
  - Signal count / fill count / reject count

The dashboard code receives paper stats through the same callback pattern used for streaming stats — the orchestrator computes them and passes them in.

---

## 5. Acceptance criteria

### 5.1 Config and mode enforcement
- [ ] `Config` type includes optional `paper` section with `initialBalanceUsdc`, `maxPositionSizeUsdc`, `maxOpenPositions`
- [ ] `config.mode === 'paper'` is required to instantiate any paper module
- [ ] In `readonly` mode, no paper module is instantiated or wired
- [ ] Paper config has sensible defaults (1000 USDC, 100 max position, 5 max positions)

### 5.2 SignalProvider interface
- [ ] `SignalProvider` port interface exists in `src/polybot/paper/types.ts`
- [ ] At least one trivial implementation exists for testing (e.g., `RandomSignalProvider` that fires a buy/sell on random price_change frames with configurable probability)
- [ ] SignalProvider receives current portfolio state so it can make position-aware decisions
- [ ] Each signal is recorded as a `paper_signal` DomainEvent

### 5.3 PaperFillEngine
- [ ] `PaperFillEngine` port interface exists in `src/polybot/paper/types.ts`
- [ ] `OrderbookFillEngine` implementation walks the real orderbook (asks for buys, bids for sells)
- [ ] Market orders consume book levels until size is filled
- [ ] Limit orders stop at the limit price
- [ ] Partial fills are returned when book depth is insufficient
- [ ] Rejected fills are returned when there is no liquidity or risk limits are breached
- [ ] Slippage is calculated relative to mid price at time of fill
- [ ] Fill engine does NOT make any network requests

### 5.4 PaperPortfolio
- [ ] `PaperPortfolio` port interface exists in `src/polybot/paper/types.ts`
- [ ] `InMemoryPortfolio` tracks USDC balance (available, locked)
- [ ] Positions are tracked per tokenId with avg entry price, size, side
- [ ] `applyFill()` correctly updates balance and positions for buys and sells
- [ ] `markToMarket()` recalculates unrealized P&L from current prices
- [ ] Closing a position (selling what you bought) realizes P&L correctly
- [ ] Balance cannot go negative (orders that would overdraw are rejected before fill)
- [ ] `getFillHistory()` returns chronologically ordered fills

### 5.5 PaperExecutor orchestration
- [ ] `PaperExecutor` wires signal → order → fill → portfolio update
- [ ] Each step (signal, order, fill) is recorded as a DomainEvent to the existing recorder
- [ ] Rejected fills are logged with reason
- [ ] Portfolio snapshot is recorded periodically (configurable interval, default 30s)
- [ ] Executor exposes portfolio for dashboard consumption

### 5.6 OrderbookAgg (in-memory orderbook cache)
- [ ] Listens to `ws_book` frames from WsSubscriber
- [ ] Maintains latest `OrderbookSnapshot` per tokenId
- [ ] Exposes `getOrderbook(tokenId): OrderbookSnapshot | undefined`
- [ ] Returns `undefined` if no book has been received yet (fill engine handles this as rejection)
- [ ] Does not persist state — purely in-memory, session-scoped

### 5.7 Dashboard integration
- [ ] Paper mode dashboard shows: balance, open positions, last fill, signal/fill/reject counts
- [ ] Dashboard renders correctly when there are zero positions and zero fills
- [ ] Dashboard does not crash or render garbage when orderbook data is stale

### 5.8 Recording and replay
- [ ] Paper events (`paper_signal`, `paper_order`, `paper_fill`, `paper_portfolio_snapshot`) are recorded in the same JSONL session file
- [ ] Replay script can display paper events alongside market data events
- [ ] Session summary includes paper stats: total signals, fills, rejects, final P&L

### 5.9 Logging and observability
- [ ] Paper module logs: signal generated, order created, fill result, portfolio update
- [ ] Log entries include sessionId, tokenId, orderId, signalId for traceability
- [ ] Errors in paper modules are logged but do NOT crash the process (paper is non-critical path)

### 5.10 Tests
- [ ] Unit tests for `InMemoryPortfolio`: buy, sell, partial fill, close position, P&L calculation, overdraw prevention
- [ ] Unit tests for `OrderbookFillEngine`: market order fill, limit order fill, partial fill, no-liquidity rejection, slippage calculation
- [ ] Unit tests for `PaperExecutor`: signal → order → fill → portfolio integration
- [ ] All tests pass with `npm test`

---

## 6. What Stage 2 does NOT include

| Excluded | Reason |
|----------|--------|
| Real wallet connection | ADR-0002: blocked until security audit |
| Real signing or private keys | ADR-0002 |
| Real order submission to CLOB | ADR-0002 |
| Strategy research or alpha generation | Stage 3 concern; paper mode validates plumbing, not strategy |
| Backtesting against historical data | Replay exists in Stage 1.5; backtesting is a different problem |
| Multi-market correlation or portfolio optimization | Premature — validate single-market order flow first |
| CLI args for paper config | Config file and env vars are sufficient for now |
| Persistent portfolio state across sessions | Each session starts fresh; cross-session analysis is offline |
| Performance optimization (batching, throttling signals) | Premature optimization |
| Event bus / pub-sub infrastructure | Two consumers do not justify the abstraction |

---

## 7. Implementation order

Each step should result in a commit. Do not accumulate multiple steps without committing.

| Step | Description | Depends on | Estimated size |
|------|-------------|------------|----------------|
| 1 | **Paper models and port interfaces** — `paper/models.ts`, `paper/types.ts` with all type definitions. No logic, just contracts. | None | Small |
| 2 | **Paper config** — Add `PaperConfig` to `schema.ts`, add defaults, add to `Config` type. Guard instantiation on `mode === 'paper'`. | Step 1 | Small |
| 3 | **InMemoryPortfolio** — Implement `PaperPortfolio` with balance tracking, position management, P&L calculation. Unit tests. | Step 1 | Medium |
| 4 | **OrderbookAgg** — In-memory latest-orderbook cache. Listens to `ws_book` frames. Unit tests. | None (can parallel with 3) | Small |
| 5 | **OrderbookFillEngine** — Implement `PaperFillEngine` that walks real orderbook. Unit tests. | Steps 1, 4 | Medium |
| 6 | **PaperExecutor** — Wire signal → order → fill → portfolio. Record events to JSONL. Unit tests. | Steps 3, 5 | Medium |
| 7 | **Trivial SignalProvider** — `RandomSignalProvider` for testing. Configurable probability. | Step 1 | Small |
| 8 | **New EventTypes** — Add `paper_signal`, `paper_order`, `paper_fill`, `paper_portfolio_snapshot` to `events.ts`. | Step 6 | Small |
| 9 | **Orchestrator integration** — Wire paper modules into orchestrator when `mode === 'paper'`. Register frame handlers. Portfolio snapshot interval. | Steps 6, 7, 8 | Medium |
| 10 | **Dashboard paper section** — Add paper stats to dashboard render. | Step 9 | Small |
| 11 | **Replay enhancement** — Replay script shows paper events alongside market data. | Step 8 | Small |
| 12 | **Integration test** — Run paper mode against live WS for 2+ minutes, verify fills recorded, P&L calculated, no crashes. | All | Small |
| 13 | **Documentation** — Update architecture.md, constraints.md, product.md. Tag `v0.3.0-paper`. | All | Small |

---

## 8. Risk register

| # | Risk | Probability | Impact | Mitigation |
|---|------|-------------|--------|------------|
| R1 | Fill simulation is too optimistic (no market impact, no queue priority) leading to false confidence in paper P&L | High | High | Document simulation assumptions in session metadata. Add a `simulationFidelity: 'low'` marker to all paper fills. Do not treat paper P&L as predictive of live P&L. |
| R2 | OrderbookAgg holds stale data (book frame not received recently), fills execute against outdated prices | Medium | Medium | Check book freshness before fill. Reject if book is older than configurable threshold (default: 30s). Log stale-book rejections. |
| R3 | Paper mode accidentally leaks into live code path in future stages | Medium | Critical | Paper modules have zero network I/O. Static analysis: grep for `fetch`, `http`, `ws` imports in `paper/` directory — must be zero. Mode guard in orchestrator prevents paper instantiation outside `mode === 'paper'`. |
| R4 | WS frame handler for paper execution slows down the recorder (synchronous processing blocks) | Low | Medium | Fill engine is synchronous and fast (walks a few book levels). If needed, decouple with `setImmediate()` to avoid blocking the recorder handler. Monitor frame processing latency. |
| R5 | P&L calculation bugs give wrong numbers, creating false confidence or false alarm | Medium | High | Exhaustive unit tests for portfolio: buy then sell, partial close, multiple positions, mark-to-market. Test with known inputs and expected outputs. |
| R6 | Scope creep: adding strategy logic, optimization, or backtesting into Stage 2 | Medium | Medium | Stage 2 ships with `RandomSignalProvider` only. Real strategies are Stage 3. Any PR that adds non-trivial signal logic is rejected. |
| R7 | Config complexity grows (too many paper knobs) | Low | Low | Minimal config: 3 fields (initialBalance, maxPositionSize, maxOpenPositions). Resist adding more until there is evidence they are needed. |
| R8 | Paper mode gives a false sense of readiness for live | High | Critical | Paper mode is a plumbing test, not a strategy proof. The plan, the dashboard, and the session summary must all state this clearly. Live readiness requires a separate gate (Stage 5). |

---

## 9. Open questions (to resolve during implementation)

1. **Should OrderbookAgg live in `paper/` or `transport/`?** It is a general-purpose component (latest-book cache) that happens to be needed first by paper mode. If it stays in `paper/`, it's simpler now but may need to move later. If it starts in `transport/`, it's more correct but slightly over-engineered for Stage 2. **Lean: `transport/` — it's not paper-specific.**

2. **Should paper fills incorporate spread as a fee?** Polymarket charges no explicit trading fee, but the spread is effectively a cost. The fill engine already walks the book (which captures spread), but should we add an explicit `spreadCostUsdc` field to `PaperFill`? **Lean: yes, it's cheap to compute during the book walk and useful for analysis.**

3. **Should the portfolio support short positions?** In Polymarket, buying "No" tokens is economically equivalent to shorting "Yes" tokens. The portfolio should model positions per tokenId, not per market. "Short" in this context means "bought the other outcome token." **Lean: model positions per tokenId with buy side only. Let the SignalProvider decide which token to buy. This avoids synthetic short logic.**

4. **Periodic portfolio snapshot frequency.** Default 30s seems reasonable. Should it be configurable? **Lean: configurable via `PaperConfig.snapshotIntervalMs`, default 30000.**

---

## 10. ADR required

Before implementation begins, create **ADR-0005: Paper trading simulation model** covering:
- Decision to walk real orderbook (not mid-price fill)
- Decision to use direct `onFrame()` callbacks (not event bus)
- Decision to record paper events in the same JSONL session
- Explicit documentation that paper P&L is NOT predictive of live P&L

---

## 11. Relationship to Stage 3+

Stage 2 delivers **plumbing**. Stage 3 delivers **brains**.

| Concern | Stage 2 | Stage 3+ |
|---------|---------|----------|
| Signal generation | RandomSignalProvider (test harness) | Real strategy implementations |
| Fill simulation | Walk real orderbook | Same, possibly with market impact model |
| Portfolio | Single-session, in-memory | Cross-session analysis, persistence |
| Dashboard | Basic paper stats | Strategy-specific metrics |
| Risk limits | maxPositionSize, maxOpenPositions | Drawdown limits, exposure limits, kill switch |
| Evaluation | Manual review of JSONL recordings | Automated P&L reports, Sharpe ratio, win rate |

The interfaces defined in Stage 2 (`SignalProvider`, `PaperFillEngine`, `PaperPortfolio`) are the contracts that Stage 3 builds on. Getting these right matters more than getting the fill simulation perfect.
