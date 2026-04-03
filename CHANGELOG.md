# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0-paper-core] — 2026-04-03

### Added
- ADR-0005: Paper trading as execution simulator, not profitability oracle
- Paper trading core module (`src/polybot/paper/`)
  - `OrderIntent`: taker-only paper order (FAK/FOK) with sizeShares or notionalUsdc
  - `OrderbookFillEngine`: walks real orderbook level-by-level for realistic fills
  - `InMemoryPortfolio`: virtual cash, positions, avg entry price, realized/unrealized P&L
  - `DefaultPaperExecutor`: intent → orderbook → fill → portfolio pipeline
  - `SessionStats`: trades, win rate, gross/net P&L, avg slippage, per-market/source breakdown
  - `RandomSignalProvider` and `StaticSignalProvider` for testing
- `OrderbookAggregator` (`transport/orderbook-agg.ts`): in-memory latest book cache from WS frames
  - Handles both `book` (full snapshot) and `price_change` (incremental) frames
- `PaperConfig` with configurable: initial balance, max position, max positions, taker fee bps,
  tick size, min order size, stale book threshold
- Paper event types: `paper_signal`, `paper_order`, `paper_fill`, `paper_rejected`, `paper_portfolio_snapshot`
- Config supports `mode: 'paper'` (in addition to `readonly`). Live mode remains blocked (ADR-0002).
- 42 new tests: fill engine (16), portfolio (10), executor (8), orderbook aggregator (8)

### Design decisions
- Fill engine walks real asks/bids — NO midpoint fills, NO fixed slippage
- Fees modeled as flat taker bps on trade notional (default 200 bps, conservative)
  - Polymarket's actual fee model charges on net winnings — this is documented as a simplification
- Taker-only (FAK/FOK) — no resting maker orders, no queue position modeling
- Paper P&L is a research tool, NOT a profitability guarantee (ADR-0005)

## [0.2.0-streaming] — 2026-04-03

### Added
- WsSubscriber: manages market subscriptions via decimal token IDs, classifies frames
  (book, price_change, last_trade_price, tick_size_change, best_bid_ask)
- Auto-resubscribe on WebSocket reconnect — no silent data loss
- Text PING keepalive every 10s (Polymarket protocol, not WS ping frame)
- Stale connection detection (no message for 60s triggers reconnect)
- Enhanced JSONL recorder: frame counts by type, session summary on close
- Orchestrator: discovers top N markets, subscribes to WS, records all frames
- Dashboard streaming panel: WS state, frame count, last frame age, reconnects, uptime
- Replay script (`scripts/replay-session.ts`): filter by event type, integrity check
- Streaming test runner (`scripts/run-streaming-test.ts`): configurable duration
- StreamingConfig: marketCount, customFeatureEnabled
- 9 new tests (8 subscriber, 1 recorder) — total 20/20

### Validated
- 45s real session: 60 frames (6 book + 54 price_change), 3 markets
- Replay: session valid, integrity check passed
- Shutdown: session summary logged, recorder flushed, exit 0

## [0.1.0-readonly] — 2026-04-03

### Added
- Initial repository governance and project structure
- `CLAUDE.md` with role, style, and rules
- `.claude/project-principles.md`
- `.claude/context/` — product, architecture, constraints
- `.claude/adr/ADR-0001` — read-only first
- `.claude/adr/ADR-0002` — no wallet until audit
- `.claude/adr/ADR-0003` — TypeScript stack choice (Node >= 20, ws package)
- `.claude/adr/ADR-0004` — MCP integration deferred
- `.claude/plans/2026-04-02-mvp-readonly.md`
- `docs/architecture/overview.md`
- `.gitignore` with security-focused exclusions
- Multi-agent development model (7 agents)
- Polymarket skills for protocol reference
- Branch strategy: main, develop, feat/*, fix/*, spike/*, sec/*
- TypeScript project scaffold (Node >= 20, strict mode)
- Domain models: Market, Outcome, OrderbookSnapshot, DomainEvent, HealthStatus
- API adapters: GammaAdapter (market discovery), ClobAdapter (orderbook read)
- HTTP client with rate limiting, retry, timeout (native fetch, no axios)
- WebSocket transport with reconnect and ping/pong health probe
- JSONL recorder with session metadata (git commit, config, timestamp)
- Structured JSON logger with level filtering
- Terminal health dashboard with color-coded component status
- Runtime orchestrator with graceful shutdown (SIGINT/SIGTERM)
- Standalone scripts: probe-ws.ts, discover-markets.ts, validate-readonly.ts
- Tests: smoke (config, models), transport (ws-probe), api (gamma-adapter)

### Fixed
- Gamma API field names: camelCase (conditionId, clobTokenIds, volumeNum), not snake_case
- Default market query: order by volume desc, exclude closed markets
- CLOB health check: probe base URL `/` instead of nonexistent `/book?token_id=0`
- WS subscription: `assets_ids` requires decimal token IDs, not hex condition IDs

### Validated (against production Polymarket)
- Gamma API: real market discovery with correct parsing
- CLOB API: real orderbook fetch (bids, asks, midPrice, spread)
- WebSocket: real `book` frame with bids/asks/timestamp/hash
- JSONL recording: full session captured end-to-end
- Graceful shutdown: clean exit code 0, recorder flushed

### Security
- Explicit rule: no real wallet or signing flow before audit
- .gitignore blocks wallet files, private keys, .env files
- Zero Polymarket SDK dependencies — raw HTTP/WS only
- No axios (supply chain risk avoidance)
