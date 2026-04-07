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
   * Fetch the fee rate for a token from the CLOB API.
   * Endpoint: GET /fee-rate?token_id={token_id}
   * Returns the decimal fee rate (e.g. 0.03 for Sports).
   *
   * Note: unauthenticated requests may return 0. In that case,
   * callers should fall back to PAPER_DEFAULTS.defaultFeeRate.
   */
  async getFeeRate(tokenId: string): Promise<number> {
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
