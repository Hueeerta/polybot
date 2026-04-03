# ADR-0003: TypeScript as primary stack

## Status
Accepted

## Date
2026-04-02

## Context
The project needs a language and runtime for building a Polymarket trading bot
that will progress through readonly, paper, and live stages. Polymarket
maintains official SDKs in multiple languages — TypeScript, Python, and Rust —
so no language is blocked by lack of vendor support.

## Decision
Use TypeScript on Node.js >= 22 (LTS) as the primary stack.

## Alternatives considered

### Python
- **Pro:** Official py-clob-client SDK exists
- **Pro:** Excellent scientific computing ecosystem for strategy research
- **Pro:** Familiar for data analysis workflows
- **Con:** WebSocket real-time client has less community activity than TS
- **Con:** Type safety weaker even with mypy — riskier for contract enforcement
  between readonly/paper/live boundaries
- **Verdict:** Strong for research layer; weaker for transport/API core

### Rust
- **Pro:** Official SDK exists
- **Pro:** Performance, memory safety, production-grade
- **Con:** Much slower development cycle for an MVP
- **Con:** Smaller community around Polymarket Rust tooling
- **Con:** Overkill for I/O-bound read-only stage
- **Verdict:** Better suited for a future performance-critical component

## Rationale
The real reason is ecosystem activity and friction reduction:
1. TypeScript has the most active community and tooling around Polymarket
   (real-time-data-client, examples, integrations)
2. TS provides compile-time type safety for enforcing contracts between
   modules — critical for readonly/paper/live boundaries
3. The path from readonly to paper to live has the least friction in TS,
   since the most maintained client libraries and examples are there
4. async/await is natural for concurrent I/O, which is the bulk of MVP work

This is NOT because TS is the only official option. It's because it offers
the best balance of ecosystem activity, type safety, and development speed
for this specific project.

## Runtime decisions

### Node.js >= 20 (minimum), 22+ recommended
- Native `fetch` available since Node 18 (stable in 20+) — no need for axios or node-fetch
- Stable ES module support
- Node 22 (current LTS) offers performance improvements; Node 20 is the minimum supported

### WebSocket: `ws` package (not native)
Node 22.4+ includes a native WebSocket client, but it follows the browser
API and lacks control over:
- Raw ping/pong frames (needed for transport health probes)
- Custom close codes and reasons
- Per-connection headers
- Fine-grained backpressure handling

For a system where transport reliability is a core concern and health probing
depends on low-level frame access, `ws` provides the necessary control.
If Node's native WebSocket matures to expose these features, migration is
straightforward since `ws` also implements the standard WebSocket API.

### HTTP: native `fetch` (no axios)
Node 22 ships native `fetch` via undici. No external HTTP library needed.
This eliminates supply-chain risk from HTTP dependencies entirely.

## Consequences

### Positive
- Lowest friction path to paper/live stages
- Strong typing catches contract errors at compile time
- Largest community of Polymarket integrators for reference
- Mature ecosystem for terminal UI, logging, testing
- Minimal runtime dependencies (ws, dotenv only)

### Negative
- Scientific computing is weaker — strategy research may need Python
- Single-threaded event loop (acceptable for I/O-bound work)
- Node.js memory management less predictable than Rust

## Polyglot escape hatch
The architecture allows invoking Python scripts for research/analysis.
The transport and API layer lives in TypeScript; the research layer can be
polyglot. This decision does not lock out Python or Rust — it scopes them
to where they add the most value.
