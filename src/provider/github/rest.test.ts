import { describe, expect, it } from 'vitest';

import type { HttpClient, HttpRequest, HttpResponse } from '../../http/client.js';
import { RateLimitError } from '../../http/ratelimit.js';
import { GitHubApiError, GitHubRest, nextLink } from './rest.js';

class ScriptedHttp implements HttpClient {
  readonly calls: HttpRequest[] = [];
  constructor(private readonly handler: (request: HttpRequest) => HttpResponse) {}
  async request(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    return this.handler(request);
  }
}

function makeRest(http: HttpClient, floor = 50): GitHubRest {
  return new GitHubRest({
    token: 'tkn',
    http,
    baseUrl: 'https://api.github.com',
    rateLimitFloor: floor,
  });
}

function futureReset(): string {
  return String(Math.floor((Date.now() + 3_600_000) / 1000));
}

describe('nextLink', () => {
  it('extracts the rel=next URL', () => {
    const header =
      '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=5>; rel="last"';
    expect(nextLink(header)).toBe('https://api.github.com/x?page=2');
    expect(nextLink(undefined)).toBeNull();
    expect(nextLink('<https://api.github.com/x?page=1>; rel="prev"')).toBeNull();
  });
});

describe('GitHubRest.json', () => {
  it('sends an authorization header and parses JSON', async () => {
    const http = new ScriptedHttp(() => ({
      status: 200,
      headers: {},
      text: JSON.stringify({ ok: true }),
    }));
    const result = await makeRest(http).json<{ ok: boolean }>('GET', '/repos/acme/widget');
    expect(result.data).toEqual({ ok: true });
    expect(http.calls[0]?.headers['authorization']).toBe('Bearer tkn');
  });

  it('uses an ETag and skips re-fetching unchanged resources', async () => {
    const http = new ScriptedHttp((request): HttpResponse =>
      request.headers['if-none-match'] === '"abc"'
        ? { status: 304, headers: {}, text: '' }
        : { status: 200, headers: { etag: '"abc"' }, text: JSON.stringify([1, 2]) },
    );
    const rest = makeRest(http);
    const first = await rest.json<number[]>('GET', '/x', { cacheKey: '/x' });
    expect(first.notModified).toBe(false);
    expect(first.data).toEqual([1, 2]);

    const second = await rest.json<number[]>('GET', '/x', { cacheKey: '/x' });
    expect(second.notModified).toBe(true);
    expect(second.data).toBeNull();
    expect(http.calls[1]?.headers['if-none-match']).toBe('"abc"');
  });

  it('backs off and rejects further calls when the quota is low', async () => {
    const http = new ScriptedHttp(() => ({
      status: 200,
      headers: { 'x-ratelimit-remaining': '5', 'x-ratelimit-reset': futureReset() },
      text: '{}',
    }));
    const rest = makeRest(http);
    await rest.json('GET', '/x');
    expect(rest.rateLimit.isBackingOff()).toBe(true);
    await expect(rest.json('GET', '/x')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('throws a typed error for non-2xx responses', async () => {
    const http = new ScriptedHttp(() => ({
      status: 404,
      headers: {},
      text: '{"message":"Not Found"}',
    }));
    await expect(makeRest(http).json('GET', '/missing')).rejects.toBeInstanceOf(GitHubApiError);
  });
});

describe('GitHubRest.paginate', () => {
  it('follows Link rel=next across pages', async () => {
    const http = new ScriptedHttp((request): HttpResponse => {
      if (request.url.includes('page=2')) {
        return { status: 200, headers: {}, text: JSON.stringify([3]) };
      }
      return {
        status: 200,
        headers: { link: '<https://api.github.com/items?page=2>; rel="next"' },
        text: JSON.stringify([1, 2]),
      };
    });
    const items = await makeRest(http).paginate<number>('/items');
    expect(items).toEqual([1, 2, 3]);
    expect(http.calls).toHaveLength(2);
  });
});
