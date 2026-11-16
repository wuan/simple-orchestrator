import { describe, expect, it } from 'vitest';

import { DEFAULT_LABELS } from '../config/types.js';
import { FakeProvider } from '../provider/fake/fake-provider.js';
import type { ProviderIssue } from '../provider/types.js';
import { startStatusServer, type StatusServerOptions } from './server.js';

/** A fake provider that counts snapshot reads and can delay them. */
class CountingProvider extends FakeProvider {
  reads = 0;

  constructor(private readonly delayMs = 0) {
    super();
  }

  override async listTriggerIssues(label: string): Promise<ProviderIssue[]> {
    this.reads += 1;
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return super.listTriggerIssues(label);
  }
}

function options(
  provider: FakeProvider,
  extra: Partial<StatusServerOptions> = {},
): StatusServerOptions {
  return {
    sources: [{ key: 'fake:acme/widget', labels: DEFAULT_LABELS, provider }],
    host: '127.0.0.1',
    port: 0,
    ...extra,
  };
}

async function withServer(
  config: StatusServerOptions,
  body: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = await startStatusServer(config);
  try {
    await body(`http://127.0.0.1:${server.port}`);
  } finally {
    await server.close();
  }
}

describe('startStatusServer', () => {
  it('serves the HTML overview at the root path', async () => {
    const provider = new FakeProvider();
    provider.seedIssue({ number: 7, title: 'Add a status view', labels: [DEFAULT_LABELS.trigger] });

    await withServer(options(provider), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      const body = await response.text();
      expect(body).toContain('fake:acme/widget');
      expect(body).toContain('Add a status view');
      expect(body).toContain('queued');
    });
  });

  it('serves the same snapshot as JSON at /status.json', async () => {
    const provider = new FakeProvider();
    provider.seedIssue({ number: 7, labels: [DEFAULT_LABELS.trigger] });
    provider.seedPullRequest({ number: 10, linkedIssue: 7, labels: [DEFAULT_LABELS.ready] });

    await withServer(options(provider), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/status.json`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      const body = (await response.json()) as {
        repositories: { key: string; workflows: { phase: string }[] }[];
      };
      expect(body.repositories[0]?.key).toBe('fake:acme/widget');
      expect(body.repositories[0]?.workflows[0]?.phase).toBe('ready');
    });
  });

  it('answers HEAD requests without a body', async () => {
    await withServer(options(new FakeProvider()), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/`, { method: 'HEAD' });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('');
    });
  });

  it('refuses a mutating request without touching the provider', async () => {
    const provider = new CountingProvider();

    await withServer(options(provider), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/`, { method: 'POST' });

      expect(response.status).toBe(405);
      expect(provider.reads).toBe(0);
    });
  });

  it('answers an unknown path with 404', async () => {
    await withServer(options(new FakeProvider()), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/nope`);
      expect(response.status).toBe(404);
    });
  });

  it('reuses one snapshot across repeated requests', async () => {
    const provider = new CountingProvider();
    provider.seedIssue({ number: 1, labels: [DEFAULT_LABELS.trigger] });

    await withServer(options(provider), async (baseUrl) => {
      await fetch(`${baseUrl}/`);
      await fetch(`${baseUrl}/status.json`);

      expect(provider.reads).toBe(1);
    });
  });

  it('shares one snapshot across concurrent requests', async () => {
    const provider = new CountingProvider(30);
    provider.seedIssue({ number: 1, labels: [DEFAULT_LABELS.trigger] });

    await withServer(options(provider), async (baseUrl) => {
      await Promise.all(Array.from({ length: 5 }, () => fetch(`${baseUrl}/status.json`)));

      expect(provider.reads).toBe(1);
    });
  });

  it('redacts credential values from both representations', async () => {
    const provider = new FakeProvider();
    provider.seedIssue({
      number: 1,
      title: 'leak super-secret-token here',
      labels: [DEFAULT_LABELS.trigger],
    });

    await withServer(options(provider, { secrets: ['super-secret-token'] }), async (baseUrl) => {
      const html = await (await fetch(`${baseUrl}/`)).text();
      const json = await (await fetch(`${baseUrl}/status.json`)).text();

      expect(html).not.toContain('super-secret-token');
      expect(json).not.toContain('super-secret-token');
      expect(json).toContain('[redacted]');
    });
  });
});
