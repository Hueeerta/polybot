---
name: polymarket-public-data
description: Read Polymarket public market metadata and orderbook prices directly from Polymarket APIs.
---

# Polymarket Public Data

Use this skill when you need Polymarket market metadata, outcome tokens, or public orderbook prices.

Important:
- Read directly from Polymarket public APIs
- No authentication required for market discovery and orderbook reads
- This is a read-only reference — no trading, no signing

## Public Endpoints

- Gamma markets API: `https://gamma-api.polymarket.com/markets`
- CLOB orderbook API: `https://clob.polymarket.com/book`

## Resolve a Market

Use one of these references:
- `slug`
- `conditionId`
- `token_id`

Examples:

```bash
curl "https://gamma-api.polymarket.com/markets?slug=will-btc-be-above-120k-on-june-30"
```

```bash
curl "https://gamma-api.polymarket.com/markets?conditionId=0x1234..."
```

Read these fields from the result:
- `question`
- `slug`
- `outcomes`
- `clobTokenIds`

Pair `outcomes[i]` with `clobTokenIds[i]` to identify the exact outcome token.

## Get an Outcome Price

After resolving the outcome token:

```bash
curl "https://clob.polymarket.com/book?token_id=123456789"
```

Use the best bid/ask to derive a mid price.

## Recommended Flow

1. Resolve the market with Gamma using `slug` or `conditionId`
2. Choose a concrete outcome such as `Yes` or `No`
3. Read the corresponding `token_id`
4. Query the CLOB orderbook directly from Polymarket
5. Record the snapshot locally for replay/analysis
