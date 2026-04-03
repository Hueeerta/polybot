/**
 * Minimal HTTP client wrapping native fetch with rate limiting and retry.
 */

export interface HttpClientConfig {
  baseUrl: string;
  rateLimitRps: number;
  maxRetries?: number;
  timeoutMs?: number;
}

export class HttpClient {
  private lastRequestTime = 0;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  readonly baseUrl: string;

  constructor(private config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.minIntervalMs = 1000 / config.rateLimitRps;
    this.maxRetries = config.maxRetries ?? 2;
    this.timeoutMs = config.timeoutMs ?? 10000;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    return this.fetchWithRetry<T>(url.toString());
  }

  private async fetchWithRetry<T>(url: string, attempt = 0): Promise<T> {
    await this.rateLimit();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        if (response.status === 429 && attempt < this.maxRetries) {
          const retryAfter = parseInt(response.headers.get('retry-after') ?? '2', 10);
          await this.sleep(retryAfter * 1000);
          return this.fetchWithRetry<T>(url, attempt + 1);
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
      }

      return (await response.json()) as T;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeoutMs}ms: ${url}`);
      }
      if (attempt < this.maxRetries && !(err instanceof Error && err.message.startsWith('HTTP'))) {
        await this.sleep(Math.pow(2, attempt) * 1000);
        return this.fetchWithRetry<T>(url, attempt + 1);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await this.sleep(this.minIntervalMs - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
