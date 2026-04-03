/**
 * API adapter test: validates Gamma adapter parses responses correctly.
 * Uses a mock HTTP server — does NOT hit real Polymarket APIs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { GammaAdapter } from '../../src/polybot/api/gamma-adapter.js';

function startMockServer(response: unknown): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    });
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

describe('GammaAdapter', () => {
  it('parses market response into domain model', async () => {
    const mockResponse = [
      {
        condition_id: 'cond-123',
        slug: 'test-market',
        question: 'Will it rain?',
        outcomes: '["Yes","No"]',
        clob_token_ids: '["token-1","token-2"]',
        active: true,
        volume: 50000,
      },
    ];

    const { server, port } = await startMockServer(mockResponse);

    try {
      const adapter = new GammaAdapter({
        baseUrl: `http://localhost:${port}`,
        rateLimitRps: 100,
      });

      const markets = await adapter.getMarkets({ limit: 1 });
      assert.equal(markets.length, 1);
      assert.equal(markets[0].slug, 'test-market');
      assert.equal(markets[0].question, 'Will it rain?');
      assert.equal(markets[0].outcomes.length, 2);
      assert.equal(markets[0].outcomes[0].label, 'Yes');
      assert.equal(markets[0].outcomes[0].tokenId, 'token-1');
      assert.equal(markets[0].outcomes[1].label, 'No');
      assert.equal(markets[0].volumeUsd, 50000);
    } finally {
      server.close();
    }
  });

  it('returns null for missing market', async () => {
    const { server, port } = await startMockServer([]);

    try {
      const adapter = new GammaAdapter({
        baseUrl: `http://localhost:${port}`,
        rateLimitRps: 100,
      });

      const market = await adapter.getMarketBySlug('nonexistent');
      assert.equal(market, null);
    } finally {
      server.close();
    }
  });
});
