import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { redact } from '../logging.js';
import {
  buildSnapshot,
  type StatusRepositoryOverview,
  type StatusSnapshot,
  type StatusSource,
  type StatusWorkflow,
} from './snapshot.js';

/** How long a built snapshot is reused before the provider is read again. */
export const DEFAULT_STATUS_REFRESH_SECONDS = 5;

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';
const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';

export interface StatusServerOptions {
  sources: StatusSource[];
  host: string;
  port: number;
  /** Seconds a snapshot is reused across requests; defaults to 5. */
  refreshSeconds?: number;
  /** Secret values to strip from every response. */
  secrets?: Iterable<string>;
  /** Clock used for the snapshot's timestamp, injectable for tests. */
  clock?: () => Date;
}

/** The part of the running server the caller has to keep to stop it. */
export interface StatusServerHandle {
  close(): Promise<void>;
}

export interface StatusServer extends StatusServerHandle {
  readonly host: string;
  readonly port: number;
}

/** Builds and binds the status listener; injectable so tests can avoid a port. */
export type StatusServerFactory = (options: StatusServerOptions) => Promise<StatusServerHandle>;

/**
 * Caches one snapshot per refresh interval and shares a build already in flight,
 * so a browser refresh or a shared link cannot multiply provider reads.
 */
class SnapshotCache {
  private cached?: { at: number; snapshot: StatusSnapshot };
  private inflight?: Promise<StatusSnapshot>;

  constructor(
    private readonly ttlMs: number,
    private readonly build: () => Promise<StatusSnapshot>,
    private readonly now: () => number,
  ) {}

  async get(): Promise<StatusSnapshot> {
    const cached = this.cached;
    if (cached !== undefined && this.now() - cached.at < this.ttlMs) {
      return cached.snapshot;
    }
    this.inflight ??= this.refresh();
    return this.inflight;
  }

  private async refresh(): Promise<StatusSnapshot> {
    try {
      const snapshot = await this.build();
      this.cached = { at: this.now(), snapshot };
      return snapshot;
    } finally {
      this.inflight = undefined;
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function link(url: string | undefined, label: string): string {
  const text = escapeHtml(label);
  if (url === undefined) return text;
  return `<a href="${escapeHtml(url)}">${text}</a>`;
}

function renderWorkflow(workflow: StatusWorkflow): string {
  const issue =
    workflow.issue === undefined
      ? '—'
      : link(workflow.issue.url, `#${workflow.issue.number} ${workflow.issue.title}`);
  const pullRequest =
    workflow.pullRequest === undefined
      ? '—'
      : link(workflow.pullRequest.url, `#${workflow.pullRequest.number}`);
  return `<tr><td>${issue}</td><td>${pullRequest}</td><td>${escapeHtml(workflow.phase)}</td></tr>`;
}

function renderRepository(repository: StatusRepositoryOverview): string {
  if (repository.workflows.length === 0) {
    return `<section><h2>${escapeHtml(repository.key)}</h2><p>No active work.</p></section>`;
  }
  const rows = repository.workflows.map(renderWorkflow).join('\n');
  return `<section>
<h2>${escapeHtml(repository.key)}</h2>
<table>
<thead><tr><th>Issue</th><th>Pull request</th><th>Phase</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</section>`;
}

/** Render the overview as a small server-rendered HTML page. */
function renderHtml(snapshot: StatusSnapshot): string {
  const sections = snapshot.repositories.map(renderRepository).join('\n');
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Orchestrator status</title></head>
<body>
<h1>Orchestrator status</h1>
<p>Generated at ${escapeHtml(snapshot.generatedAt)}</p>
${sections}
</body>
</html>`;
}

function respond(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string,
  head: boolean,
): void {
  response.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  if (head) response.end();
  else response.end(body);
}

function requestPath(request: IncomingMessage): string {
  const host = request.headers.host ?? 'localhost';
  return new URL(request.url ?? '/', `http://${host}`).pathname;
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  cache: SnapshotCache,
  secrets: readonly string[],
): Promise<void> {
  const method = request.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    respond(response, 405, TEXT_CONTENT_TYPE, 'Method Not Allowed', method === 'HEAD');
    return;
  }
  const head = method === 'HEAD';
  const path = requestPath(request);
  if (path === '/') {
    const snapshot = await cache.get();
    respond(response, 200, HTML_CONTENT_TYPE, redact(renderHtml(snapshot), secrets), head);
    return;
  }
  if (path === '/status.json') {
    const snapshot = await cache.get();
    respond(response, 200, JSON_CONTENT_TYPE, redact(JSON.stringify(snapshot), secrets), head);
    return;
  }
  respond(response, 404, TEXT_CONTENT_TYPE, 'Not Found', head);
}

/**
 * Start the read-only status listener. It serves the HTML overview at `/`, the
 * same snapshot as JSON at `/status.json`, and refuses every other method.
 */
export async function startStatusServer(options: StatusServerOptions): Promise<StatusServer> {
  const secrets = [...(options.secrets ?? [])].filter((secret) => secret !== '');
  const cache = new SnapshotCache(
    (options.refreshSeconds ?? DEFAULT_STATUS_REFRESH_SECONDS) * 1000,
    () => buildSnapshot(options.sources, options.clock),
    () => Date.now(),
  );
  const server = createServer((request, response) => {
    void handle(request, response, cache, secrets).catch(() => {
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': TEXT_CONTENT_TYPE });
      }
      response.end('status error');
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once('error', onError);
    server.listen(options.port, options.host, () => {
      server.off('error', onError);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : options.port;
  return {
    host: options.host,
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
