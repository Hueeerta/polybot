# ADR-0005: Paper trading as execution simulator, not profitability oracle

## Status
Accepted

## Context
Stage 2 introduces paper trading. There is a natural temptation to treat paper P&L as predictive of live performance. This ADR establishes the architectural intent and boundaries of the paper trading module to prevent that mistake.

## Decision

### 1. Paper mode does NOT validate alpha or live profitability
Paper trading simulates the execution pipeline (signal → order → fill → position → P&L). It proves that the plumbing works. It does NOT prove that a strategy is profitable, because:
- No market impact modeling (our order doesn't move the price)
- No queue priority for maker orders
- No latency between decision and execution
- No adversarial fills or front-running
- Fee model is a parametrized approximation, not per-market actual

Paper P&L must be reported as a research tool, never as a guarantee.

### 2. The objective is to simulate execution over the real orderbook
The fill engine walks the actual orderbook snapshot (bids/asks from live WS frames). It does NOT:
- Use a fixed midpoint as fill price
- Apply arbitrary fixed slippage
- Invent prices outside the book

This gives fills that are plausible given the observed market state, but not identical to what a real execution would achieve.

### 3. First cut is taker-only
Stage 2A supports only immediate execution: Fill-And-Kill (FAK) and Fill-Or-Kill (FOK). No resting maker orders.

Rationale: maker orders require queue position modeling, which is complex and unreliable without exchange-provided queue data. Taker-only avoids this and still validates the full execution pipeline.

### 4. Maker simulation and queue position are out of scope
Resting limit orders, queue position estimation, and maker fills are deferred to a future stage. They will require:
- Time-priority modeling (first-come queue)
- Probabilistic fill estimation
- Cancel/replace logic

These are hard problems that don't need to be solved to validate the paper execution pipeline.

### 5. Paper P&L is a research instrument, not a prediction
All paper sessions must include metadata stating:
- simulationFidelity: 'low' (taker-only, no impact, parametrized fees)
- That results are not predictive of live P&L
- Which assumptions were active during the session

Session summaries and dashboards should surface this caveat.

## Consequences

### Positive
- Forces honest assessment of what paper mode can and cannot tell us
- Prevents premature confidence in untested strategies
- Keeps Stage 2A scope focused on execution plumbing
- Establishes clear upgrade path (maker sim, impact model) for future stages

### Negative
- Paper P&L will overestimate fill quality (no impact, no queue)
- Taker-only limits the types of strategies that can be tested in Stage 2
- Fee model is approximate until per-market data is integrated

## Follow-up
- Stage 2B: wire paper core into orchestrator, dashboard, signal plumbing
- Stage 2C: add per-market fee rates from last_trade_price frames
- Future: evaluate maker simulation feasibility (queue position, time priority)
