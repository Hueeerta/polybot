# ADR-0003: TypeScript as primary stack

## Status
Accepted

## Date
2026-04-02

## Context
The project needs a language and runtime for building a Polymarket trading bot that will progress through readonly, paper, and live stages. The primary work in the MVP is consuming Polymarket APIs (REST + WebSocket) and building terminal-based observability.

## Decision
Use TypeScript on Node.js as the primary stack.

## Alternatives considered

### Python
- **Pro:** Excellent scientific computing ecosystem (numpy, pandas) for future strategy research
- **Pro:** py-clob-client exists
- **Con:** No official WebSocket real-time client — would need to port or build one
- **Con:** Weaker type safety even with mypy
- **Con:** Secondary SDK support from Polymarket
- **Verdict:** Better for research phase, not for transport/API core

### Rust
- **Pro:** Performance, memory safety, production-grade
- **Con:** No official Polymarket SDK — everything from scratch
- **Con:** Much slower development cycle for MVP
- **Con:** Overkill for I/O-bound read-only stage
- **Verdict:** Premature for this stage

## Rationale
The strongest argument is ecosystem alignment:
- `@polymarket/real-time-data-client` is TypeScript-only
- `@polymarket/clob-client` is TypeScript
- Official documentation and examples are TypeScript
- Fighting the vendor's ecosystem means maintaining unofficial wrappers and lagging on protocol changes

TypeScript also provides compile-time type safety for contracts between modules (readonly/paper/live boundaries), which is critical for this project's architecture.

## Consequences

### Positive
- Direct access to official SDKs and WebSocket client
- Strong typing catches contract errors at compile time
- Mature async/await for concurrent I/O operations
- Large ecosystem for terminal UI, logging, testing

### Negative
- Scientific computing is weaker — strategy research may need Python scripts
- Single-threaded event loop (acceptable for I/O-bound work)
- Node.js memory management less predictable than Rust

## Polyglot escape hatch
The architecture allows invoking Python scripts for research/analysis tasks. The transport and API layer lives in TypeScript; the research layer can be polyglot if needed. This decision does not lock out Python — it scopes it to where it adds the most value.
