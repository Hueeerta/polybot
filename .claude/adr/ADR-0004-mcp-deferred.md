# ADR-0004: Defer polymarket-mcp-server integration

## Status
Accepted

## Date
2026-04-02

## Context
The repo `https://github.com/caiovicentino/polymarket-mcp-server` provides an MCP server for Polymarket. It could serve as a read-only data source or as a reference for API patterns.

## Decision
Do not integrate polymarket-mcp-server as an active dependency in this stage. Keep it as reference material only. Evaluate in a future `spike/mcp-evaluation` branch if and when the core readonly transport is stable.

## Rationale
1. Polymarket's public APIs are directly accessible — no MCP intermediary needed
2. Adding an unaudited external MCP server increases attack surface
3. The project already has Polymarket skills with API reference docs
4. MCP adds an abstraction layer that could mask transport issues we need to understand directly
5. The project principle "evidence over optimism" requires validating our own transport before delegating to third-party tooling

## Consequences

### Positive
- Simpler dependency graph
- Direct understanding of Polymarket APIs
- No unaudited code in the critical path

### Negative
- May miss convenience features the MCP provides
- Will need to build API clients from scratch (but this is intentional for understanding)

## Future evaluation criteria
Before integrating the MCP, the following must be true:
- [ ] Core readonly transport is stable (WS + REST)
- [ ] MCP server code has been reviewed (security-wallet-auditor)
- [ ] Benefits over direct API access are documented
- [ ] Integration is done in an isolated spike branch
