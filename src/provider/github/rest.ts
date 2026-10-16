import type { HttpClient } from '../../http/client.js';
import { RateLimitError, RateLimitTracker, resetTimeFromHeaders } from '../../http/ratelimit.js';
import {
  GitHubApiError,
  type GitHubTransport,
  type JsonOptions,
  type JsonResult,
  type QueryValue,
} from './transport.js';

export { GitHubApiError };
export type { JsonOptions, JsonResult, QueryValue };

/** Extract the `rel="next"` URL from a `Link` header, if present. */
export function nextLink(header: string | undefined): string | null {
  if (header === undefined) return null;
  for (const part of header.split(',')) {
    const match = /<([^>]+)>;\s*rel="([^"]+)"/.exec(part.trim());
    if (match !== null && match[2] === 'next') return match[1] ?? null;
  }
  return null;
}

export interface GitHubRestOptions {
  token: string;
  http: HttpClient;
  baseUrl?: string;
  userAgent?: string;
  /** Remaining-quota floor below which the client backs off. */
  rateLimitFloor?: number;
}

/**
 * A thin GitHub REST client that adds bearer auth, ETag caching for conditional
 * requests, pagination, and rate-limit backoff.
 */
export class GitHubRest implements GitHubTransport {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly http: HttpClient;
  private readonly userAgent: string;
  private readonly etags = new Map<string, string>();
  private readonly limiter: RateLimitTracker;

  constructor(options: GitHubRestOptions) {
    this.baseUrl = options.baseUrl ?? 'https://api.github.com';
    this.token = options.token;
    this.http = options.http;
    this.userAgent = options.userAgent ?? 'openspec-workflow-orchestrator';
    this.limiter = new RateLimitTracker(options.rateLimitFloor ?? 50);
  }

  get rateLimit(): RateLimitTracker {
    return this.limiter;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${this.token}`,
      'user-agent': this.userAgent,
      'x-github-api-version': '2022-11-28',
      ...extra,
    };
  }

  private buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(path, this.baseUrl);
    if (query !== undefined) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private checkRateLimitResponse(status: number, headers: Record<string, string>): void {
    if (status === 403 || status === 429) {
      const resetAt = resetTimeFromHeaders(headers);
      if (headers['x-ratelimit-remaining'] !== undefined || resetAt !== null) {
        throw new RateLimitError(
          `GitHub returned ${status}; rate limit resets at ${resetAt?.toISOString() ?? 'unknown'}`,
          resetAt,
        );
      }
    }
  }

  async json<T>(method: string, path: string, options: JsonOptions = {}): Promise<JsonResult<T>> {
    this.limiter.assertAllowed();
    const url = this.buildUrl(path, options.query);
    const extra: Record<string, string> = {};
    if (options.body !== undefined) extra['content-type'] = 'application/json';
    if (options.cacheKey !== undefined) {
      const etag = this.etags.get(options.cacheKey);
      if (etag !== undefined) extra['if-none-match'] = etag;
    }

    const response = await this.http.request({
      method,
      url,
      headers: this.headers(extra),
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    this.limiter.observe(response.headers);
    if (options.cacheKey !== undefined) {
      const etag = response.headers['etag'];
      if (etag !== undefined) this.etags.set(options.cacheKey, etag);
    }
    if (response.status === 304) return { status: 304, data: null, notModified: true };

    this.checkRateLimitResponse(response.status, response.headers);
    if (response.status >= 400) {
      throw new GitHubApiError(
        `GitHub ${method} ${path} failed with ${response.status}: ${response.text}`,
        response.status,
      );
    }
    const data = response.text === '' ? null : (JSON.parse(response.text) as T);
    return { status: response.status, data, notModified: false };
  }

  /** GET every page of a paginated endpoint, following `Link` rel="next". */
  async paginate<T>(path: string, query?: Record<string, QueryValue>): Promise<T[]> {
    const results: T[] = [];
    let url: string | null = this.buildUrl(path, query);
    while (url !== null) {
      this.limiter.assertAllowed();
      const response = await this.http.request({ method: 'GET', url, headers: this.headers() });
      this.limiter.observe(response.headers);
      this.checkRateLimitResponse(response.status, response.headers);
      if (response.status >= 400) {
        throw new GitHubApiError(
          `GitHub GET ${url} failed with ${response.status}: ${response.text}`,
          response.status,
        );
      }
      const page = response.text === '' ? [] : (JSON.parse(response.text) as T[]);
      results.push(...page);
      url = nextLink(response.headers['link']);
    }
    return results;
  }
}
