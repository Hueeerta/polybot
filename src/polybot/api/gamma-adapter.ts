/**
 * MarketProvider adapter using Polymarket Gamma API via raw HTTP.
 * Translates Gamma response shapes into domain Market types.
 */

import type { MarketProvider } from './types.js';
import type { Market, Outcome } from '../models/market.js';
import type { GammaConfig } from '../config/schema.js';
import { HttpClient } from './http-client.js';

/** Raw shape from Gamma API — not part of our domain */
interface GammaMarketResponse {
  condition_id: string;
  slug: string;
  question: string;
  outcomes: string;         // JSON-encoded array, e.g. '["Yes","No"]'
  clob_token_ids: string;   // JSON-encoded array, e.g. '["123","456"]'
  active: boolean;
  updated_at?: string;
  end_date_iso?: string;
  volume?: number;
}

function parseGammaMarket(raw: GammaMarketResponse): Market {
  let outcomeLabels: string[];
  let tokenIds: string[];

  try {
    outcomeLabels = JSON.parse(raw.outcomes);
    tokenIds = JSON.parse(raw.clob_token_ids);
  } catch {
    outcomeLabels = [];
    tokenIds = [];
  }

  const outcomes: Outcome[] = outcomeLabels.map((label, i) => ({
    label,
    tokenId: tokenIds[i] ?? '',
  }));

  return {
    conditionId: raw.condition_id,
    slug: raw.slug,
    question: raw.question,
    outcomes,
    active: raw.active,
    updatedAt: raw.updated_at,
    endDate: raw.end_date_iso,
    volumeUsd: raw.volume,
  };
}

export class GammaAdapter implements MarketProvider {
  private http: HttpClient;

  constructor(config: GammaConfig) {
    this.http = new HttpClient({
      baseUrl: config.baseUrl,
      rateLimitRps: config.rateLimitRps,
    });
  }

  async getMarkets(opts?: { limit?: number; active?: boolean }): Promise<Market[]> {
    const params: Record<string, string> = {};
    if (opts?.limit) params.limit = String(opts.limit);
    if (opts?.active !== undefined) params.active = String(opts.active);

    const raw = await this.http.get<GammaMarketResponse[]>('/markets', params);
    return raw.map(parseGammaMarket);
  }

  async getMarketBySlug(slug: string): Promise<Market | null> {
    const raw = await this.http.get<GammaMarketResponse[]>('/markets', { slug });
    if (!raw.length) return null;
    return parseGammaMarket(raw[0]);
  }

  async getMarketByConditionId(conditionId: string): Promise<Market | null> {
    const raw = await this.http.get<GammaMarketResponse[]>('/markets', { condition_id: conditionId });
    if (!raw.length) return null;
    return parseGammaMarket(raw[0]);
  }
}
