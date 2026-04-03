# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Initial repository governance and project structure
- `CLAUDE.md` with role, style, and rules
- `.claude/project-principles.md`
- `.claude/context/` — product, architecture, constraints
- `.claude/adr/ADR-0001` — read-only first
- `.claude/adr/ADR-0002` — no wallet until audit
- `.claude/adr/ADR-0003` — TypeScript stack choice
- `.claude/adr/ADR-0004` — MCP integration deferred
- `.claude/plans/2026-04-02-mvp-readonly.md`
- `docs/architecture/overview.md`
- `.gitignore` with security-focused exclusions
- Multi-agent development model (7 agents)
- Polymarket skills for protocol reference
- Branch strategy: main, develop, feat/*, fix/*, spike/*, sec/*

### Added (bootstrap — feat/bootstrap, not yet merged)
- TypeScript project scaffold (Node >= 20, strict mode)
- Domain models: Market, Outcome, OrderbookSnapshot, DomainEvent, HealthStatus
- API adapters: GammaAdapter (market discovery), ClobAdapter (orderbook read)
- HTTP client with rate limiting, retry, timeout (native fetch, no axios)
- WebSocket transport with reconnect and ping/pong health probe
- JSONL recorder with session metadata (git commit, config, timestamp)
- Structured JSON logger with level filtering
- Terminal health dashboard with color-coded component status
- Runtime orchestrator with graceful shutdown (SIGINT/SIGTERM)
- Standalone scripts: probe-ws.ts, discover-markets.ts
- Tests: smoke (config, models), transport (ws-probe), api (gamma-adapter)
- ADR-0003 updated: Node >= 20 minimum, ws justified over native WebSocket

### Security
- Explicit rule: no real wallet or signing flow before audit
- .gitignore blocks wallet files, private keys, .env files
- Zero Polymarket SDK dependencies — raw HTTP/WS only
- No axios (supply chain risk avoidance)
