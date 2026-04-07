/**
 * OrderbookProvider adapter using Polymarket CLOB API via raw HTTP.
 * Translates CLOB response shapes into domain OrderbookSnapshot types.
 */

import type { OrderbookProvider } from './types.js';
import type { OrderbookSnapshot, BookLevel } from '../models/orderbook.js';
import type { ClobConfig } from '../config/schema.js';
import { HttpClient } from './http-client.js';

/** Raw shape from CLOB API — not part of our domain */
interface ClobBookResponse {
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}

interface ClobFeeRateResponse {
  /** Decimal fee rate (e.g. 0.03 for Sports). Returns 0 for unauthenticated requests. */
  base_fee: number;
}

function parseLevel(raw: { price: string; size: string }): BookLevel {
  return {
    price: parseFloat(raw.price),
    size: parseFloat(raw.size),
  };
}

export class ClobAdapter implements OrderbookProvider {
  private http: HttpClient;

  constructor(config: ClobConfig) {
    this.http = new HttpClient({
      baseUrl: config.baseUrl,
      rateLimitRps: config.rateLimitRps,
    });
  }

  /**
   * Fetch the raw fee rate (bps) for a token from the CLOB API.
   * Endpoint: GET /fee-rate?token_id={token_id}
   *
   * IMPORTANT: The CLOB API returns `base_fee` in basis points (e.g. 1000 = 10%).
   * This is the smart contract's parameter used with `min(p, 1-p)` formula,
   * NOT the decimal feeRate used in the official docs formula `p*(1-p)`.
   *
   * These two formulas are structurally different — there is no direct conversion.
   * Paper trading uses the docs formula with category-based decimal rates:
   *   Crypto=0.072, Sports=0.03, Finance/Politics=0.04, Other=0.05, Geopolitics=0
   *
   * Returns the raw bps value for diagnostic/logging purposes.
   */
  async getFeeRateBps(tokenId: string): Promise<number> {
    const resp = await this.http.get<ClobFeeRateResponse>('/fee-rate', { token_id: tokenId });
    return resp.base_fee;
  }

  async getOrderbook(tokenId: string): Promise<OrderbookSnapshot> {
    const raw = await this.http.get<ClobBookResponse>('/book', { token_id: tokenId });

    const bids = raw.bids.map(parseLevel).sort((a, b) => b.price - a.price);
    const asks = raw.asks.map(parseLevel).sort((a, b) => a.price - b.price);

    const bestBid = bids.length > 0 ? bids[0].price : undefined;
    const bestAsk = asks.length > 0 ? asks[0].price : undefined;
    const midPrice = bestBid !== undefined && bestAsk !== undefined
      ? (bestBid + bestAsk) / 2
      : undefined;
    const spread = bestBid !== undefined && bestAsk !== undefined
      ? bestAsk - bestBid
      : undefined;

    return {
      tokenId,
      bids,
      asks,
      bestBid,
      bestAsk,
      midPrice,
      spread,
      capturedAt: new Date().toISOString(),
    };
  }
}
