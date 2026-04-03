# Architecture Overview

## Purpose

This repository is building a Polymarket trading system in staged layers:

1. **Read-only**
2. **Paper**
3. **Live**

The current milestone is **read-only only**.

The purpose of the read-only stage is to establish a stable, observable, testable foundation before any trading simulation or live execution is introduced.

---

## Architectural Principles

### 1. Read-only first
No paper or live execution should be implemented until transport, data quality, logging, and replay are stable.

### 2. Strict separation of concerns
The system must separate:
- data acquisition
- signal research
- simulation
- live execution
- credential handling

### 3. Safety over speed
A slower but auditable system is preferred over a fast but opaque one.

### 4. Replayability
Every important market-data flow should be capturable and replayable.

### 5. Versioned evolution
Every stable step should be recoverable through Git branches, tags, and changelog entries.

---

## Target Layered Design

```text
                ┌──────────────────────┐
                │   External Sources   │
                │ Gamma / Data / CLOB  │
                │ WebSocket / MCPs     │
                └──────────┬───────────┘
                           │
                  ┌────────▼────────┐
                  │    Transport     │
                  │ WS probe / HTTP  │
                  │ lifecycle / health│
                  └────────┬─────────┘
                           │
                  ┌────────▼────────┐
                  │      Models      │
                  │ market / outcome │
                  │ orderbook / event│
                  └────────┬─────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼───────┐  ┌──────▼──────┐  ┌────────▼────────┐
│   Recorder     │  │   Replay    │  │   Research      │
│ raw snapshots  │  │ deterministic│  │ signal study    │
│ sessions/logs  │  │ re-runs      │  │ no execution    │
└───────┬────────┘  └──────┬──────┘  └────────┬────────┘
        │                  │                  │
        └──────────────┬───┴──────────────────┘
                       │
               ┌───────▼────────┐
               │   Runtime / UI  │
               │ dashboard / CLI │
               │ health / summary│
               └─────────────────┘