import type { HttpClient, HttpRequest, HttpResponse } from '../../../http/client.js';

interface IssueRecord {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
}

interface PullRecord {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  merged: boolean;
  draft: boolean;
  head: string;
  base: string;
  labels: string[];
  linkedIssue?: number;
}

interface ReviewRecord {
  id: number;
  user: { login: string; type: string };
  state: string;
  body: string;
  submitted_at: string;
}

interface CommentRecord {
  id: number;
  user: { login: string; type: string };
  body: string;
  created_at: string;
}

function json(status: number, data: unknown, headers: Record<string, string> = {}): HttpResponse {
  return { status, headers, text: JSON.stringify(data) };
}

/** A field read as a string, or `fallback` when absent or not a string. */
function stringField(
  source: Record<string, unknown> | undefined,
  key: string,
  fallback = '',
): string {
  const value = source?.[key];
  return typeof value === 'string' ? value : fallback;
}

/** A field read as a string array, rejecting absent or non-array values. */
function stringArrayField(source: Record<string, unknown> | undefined, key: string): string[] {
  const value = source?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * A minimal in-memory GitHub REST emulator covering exactly the endpoints the
 * `GitHubProvider` uses. Lets the adapter be tested (and contract-tested)
 * without a network or token.
 */
export class InMemoryGitHub implements HttpClient {
  readonly owner: string;
  readonly repo: string;
  readonly botLogin: string;

  private readonly issues = new Map<number, IssueRecord>();
  private readonly pulls = new Map<number, PullRecord>();
  private readonly reviews = new Map<number, ReviewRecord[]>();
  private readonly comments = new Map<number, CommentRecord[]>();
  private readonly refs = new Map<string, string>();
  private readonly commits = new Map<string, { tree: string; parents: string[] }>();
  private readonly repoLabels = new Set<string>();
  private nextNumber = 100;
  private nextId = 1;
  private nextCommit = 1;
  private clock = Date.parse('2026-01-01T00:00:00.000Z');

  readonly calls: { method: string; path: string }[] = [];

  constructor(options: { owner?: string; repo?: string; botLogin?: string } = {}) {
    this.owner = options.owner ?? 'acme';
    this.repo = options.repo ?? 'widget';
    this.botLogin = options.botLogin ?? 'openspec-bot';
    this.refs.set('main', 'base-sha');
    this.commits.set('base-sha', { tree: 'base-tree', parents: [] });
  }

  private tick(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  seedIssue(input: {
    number: number;
    title?: string;
    labels?: string[];
    state?: 'open' | 'closed';
  }): void {
    this.issues.set(input.number, {
      number: input.number,
      title: input.title ?? `Issue ${input.number}`,
      body: '',
      state: input.state ?? 'open',
      labels: [...(input.labels ?? [])],
    });
  }

  seedPull(input: {
    number: number;
    title?: string;
    head: string;
    base?: string;
    draft?: boolean;
    state?: 'open' | 'closed';
    merged?: boolean;
    labels?: string[];
  }): void {
    this.pulls.set(input.number, {
      number: input.number,
      title: input.title ?? `Pull ${input.number}`,
      body: '',
      state: input.state ?? 'open',
      merged: input.merged ?? false,
      draft: input.draft ?? false,
      head: input.head,
      base: input.base ?? 'main',
      labels: [...(input.labels ?? [])],
    });
  }

  seedReview(input: {
    pull: number;
    state: string;
    login?: string;
    bot?: boolean;
    body?: string;
  }): void {
    const list = this.reviews.get(input.pull) ?? [];
    list.push({
      id: this.nextId++,
      user: { login: input.login ?? 'reviewer', type: input.bot === true ? 'Bot' : 'User' },
      state: input.state,
      body: input.body ?? '',
      submitted_at: this.tick(),
    });
    this.reviews.set(input.pull, list);
  }

  seedComment(input: { target: number; login?: string; bot?: boolean; body?: string }): void {
    const list = this.comments.get(input.target) ?? [];
    list.push({
      id: this.nextId++,
      user: { login: input.login ?? 'commenter', type: input.bot === true ? 'Bot' : 'User' },
      body: input.body ?? 'comment',
      created_at: this.tick(),
    });
    this.comments.set(input.target, list);
  }

  /** Create or move a branch ref, e.g. to simulate a leftover workflow branch. */
  seedRef(branch: string, sha: string): void {
    this.refs.set(branch, sha);
  }

  /** The commit SHA a branch currently points at, or undefined when it is gone. */
  branchSha(branch: string): string | undefined {
    return this.refs.get(branch);
  }

  /** Labels defined on the repository, as opposed to applied to an issue. */
  repoLabelNames(): string[] {
    return [...this.repoLabels];
  }

  /** Add a label to the repository's label set. */
  seedRepoLabel(name: string): void {
    this.repoLabels.add(name);
  }

  private resolveLabels(number: number): string[] | undefined {
    return this.pulls.get(number)?.labels ?? this.issues.get(number)?.labels;
  }

  private issuePayload(record: IssueRecord): unknown {
    return {
      number: record.number,
      title: record.title,
      body: record.body,
      state: record.state,
      labels: record.labels.map((name) => ({ name })),
    };
  }

  private pullPayload(record: PullRecord): unknown {
    return {
      number: record.number,
      title: record.title,
      body: record.body,
      state: record.state,
      draft: record.draft,
      merged_at: record.merged ? this.tick() : null,
      node_id: this.nodeId(record.number),
      head: { ref: record.head },
      base: { ref: record.base },
      labels: record.labels.map((name) => ({ name })),
    };
  }

  /** The GraphQL global node id the emulator assigns to a pull request. */
  private nodeId(number: number): string {
    return `PR_node_${number}`;
  }

  request(input: HttpRequest): Promise<HttpResponse> {
    const url = new URL(input.url);
    this.calls.push({ method: input.method, path: url.pathname });
    const body =
      input.body === undefined ? undefined : (JSON.parse(input.body) as Record<string, unknown>);
    return Promise.resolve(this.route(input.method, url, body));
  }

  /** Dispatch one request to the first handler that recognises it. */
  private route(method: string, url: URL, body: Record<string, unknown> | undefined): HttpResponse {
    const path = url.pathname;
    const user = this.handleUser(method, path);
    if (user !== null) return user;
    const graphql = this.handleGraphql(method, path, body);
    if (graphql !== null) return graphql;
    const repoLabels = this.handleRepoLabels(method, path, body);
    if (repoLabels !== null) return repoLabels;
    const issues = this.handleIssues(method, url, body);
    if (issues !== null) return issues;
    const comments = this.handleComments(method, path, body);
    if (comments !== null) return comments;
    const gitCommits = this.handleGitCommits(method, path, body);
    if (gitCommits !== null) return gitCommits;
    const gitRefs = this.handleGitRefs(method, path, body);
    if (gitRefs !== null) return gitRefs;
    const pulls = this.handlePulls(method, url, body);
    if (pulls !== null) return pulls;
    return json(404, { message: `no route for ${method} ${path}` });
  }

  private handleUser(method: string, path: string): HttpResponse | null {
    if (method === 'GET' && path === '/user') {
      return json(200, { login: this.botLogin, type: 'Bot' });
    }
    return null;
  }

  private handleGraphql(
    method: string,
    path: string,
    body: Record<string, unknown> | undefined,
  ): HttpResponse | null {
    if (method !== 'POST' || path !== '/graphql') return null;
    const query = stringField(body, 'query');
    if (!query.includes('markPullRequestReadyForReview')) {
      return json(200, { errors: [{ message: 'unsupported GraphQL operation' }] });
    }
    const variables =
      (body?.['variables'] as Record<string, unknown> | undefined) ??
      ({} as Record<string, unknown>);
    const pullRequestId = stringField(variables, 'pullRequestId');
    const record = [...this.pulls.values()].find(
      (pull) => this.nodeId(pull.number) === pullRequestId,
    );
    if (record === undefined) {
      return json(200, {
        errors: [
          { message: `Could not resolve to a node with the global id of '${pullRequestId}'` },
        ],
      });
    }
    // The mutation is idempotent: an already-ready pull request is unchanged.
    record.draft = false;
    return json(200, {
      data: {
        markPullRequestReadyForReview: {
          pullRequest: { id: pullRequestId, isDraft: false },
        },
      },
    });
  }

  private handleRepoLabels(
    method: string,
    path: string,
    body: Record<string, unknown> | undefined,
  ): HttpResponse | null {
    if (!/^\/repos\/[^/]+\/[^/]+\/labels$/.test(path)) return null;
    if (method === 'GET')
      return json(
        200,
        [...this.repoLabels].map((name) => ({ name })),
      );
    if (method !== 'POST') return null;
    const name = stringField(body, 'name');
    this.repoLabels.add(name);
    return json(201, { name });
  }

  private handleIssues(
    method: string,
    url: URL,
    body: Record<string, unknown> | undefined,
  ): HttpResponse | null {
    const path = url.pathname;
    if (/^\/repos\/[^/]+\/[^/]+\/issues$/.test(path) && method === 'GET') {
      return json(200, this.listIssues(url));
    }
    const issue = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/.exec(path);
    if (issue !== null && method === 'GET') {
      const record = this.issues.get(Number(issue[1]));
      if (record === undefined) return json(404, { message: 'Not Found' });
      return json(200, this.issuePayload(record));
    }
    const add = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/labels$/.exec(path);
    if (add !== null && method === 'POST') return this.addLabels(Number(add[1]), body);
    const remove = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/labels\/(.+)$/.exec(path);
    if (remove !== null && method === 'DELETE') {
      return this.removeLabel(Number(remove[1]), decodeURIComponent(remove[2] ?? ''));
    }
    return null;
  }

  private listIssues(url: URL): unknown[] {
    const labelFilter = url.searchParams.get('labels');
    const stateFilter = url.searchParams.get('state');
    const stateAllows = (state: string): boolean =>
      stateFilter === null || stateFilter === 'all' || stateFilter === state;
    const issueList = [...this.issues.values()]
      .filter(
        (issue) =>
          stateAllows(issue.state) && (labelFilter === null || issue.labels.includes(labelFilter)),
      )
      .map((issue) => this.issuePayload(issue));
    const pullAsIssues = [...this.pulls.values()]
      .filter(
        (pull) =>
          stateAllows(pull.state) && (labelFilter === null || pull.labels.includes(labelFilter)),
      )
      .map((pull) => ({
        number: pull.number,
        title: pull.title,
        body: pull.body,
        state: pull.state,
        labels: pull.labels.map((name) => ({ name })),
        pull_request: {},
      }));
    return [...issueList, ...pullAsIssues];
  }

  private addLabels(number: number, body: Record<string, unknown> | undefined): HttpResponse {
    const target = this.resolveLabels(number);
    const incoming = stringArrayField(body, 'labels');
    // GitHub refuses to apply a label that is not defined on the repository.
    if (incoming.some((label) => !this.repoLabels.has(label))) {
      return json(422, { message: 'Validation Failed' });
    }
    if (target !== undefined) {
      for (const label of incoming) if (!target.includes(label)) target.push(label);
    }
    return json(
      200,
      incoming.map((name) => ({ name })),
    );
  }

  private removeLabel(number: number, label: string): HttpResponse {
    const target = this.resolveLabels(number);
    const index = target?.indexOf(label) ?? -1;
    if (target === undefined || index < 0) {
      return json(404, { message: 'Label does not exist' });
    }
    target.splice(index, 1);
    return { status: 200, headers: {}, text: '' };
  }

  private handleComments(
    method: string,
    path: string,
    body: Record<string, unknown> | undefined,
  ): HttpResponse | null {
    const match = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments$/.exec(path);
    if (match === null) return null;
    const number = Number(match[1]);
    if (method === 'GET') return json(200, [...(this.comments.get(number) ?? [])]);
    if (method !== 'POST') return null;
    const list = this.comments.get(number) ?? [];
    const record: CommentRecord = {
      id: this.nextId++,
      user: { login: this.botLogin, type: 'Bot' },
      body: stringField(body, 'body'),
      created_at: this.tick(),
    };
    list.push(record);
    this.comments.set(number, list);
    return json(201, record);
  }

  private handleGitCommits(
    method: string,
    path: string,
    body: Record<string, unknown> | undefined,
  ): HttpResponse | null {
    const commit = /^\/repos\/[^/]+\/[^/]+\/git\/commits\/(.+)$/.exec(path);
    if (commit !== null && method === 'GET') {
      const sha = commit[1] ?? '';
      const record = this.commits.get(sha);
      if (record === undefined) return json(404, { message: 'Not Found' });
      return json(200, { sha, tree: { sha: record.tree }, parents: record.parents });
    }
    if (/^\/repos\/[^/]+\/[^/]+\/git\/commits$/.test(path) && method === 'POST') {
      const tree = stringField(body, 'tree');
      const parents = stringArrayField(body, 'parents');
      const sha = `commit-${this.nextCommit++}`;
      this.commits.set(sha, { tree, parents });
      return json(201, { sha, tree: { sha: tree }, parents });
    }
    return null;
  }

  private handleGitRefs(
    method: string,
    path: string,
    body: Record<string, unknown> | undefined,
  ): HttpResponse | null {
    const ref = /^\/repos\/[^/]+\/[^/]+\/git\/ref\/heads\/(.+)$/.exec(path);
    if (ref !== null && method === 'GET') {
      const branch = ref[1] ?? '';
      const sha = this.refs.get(branch);
      if (sha === undefined) return json(404, { message: 'Reference does not exist' });
      return json(200, { ref: `refs/heads/${branch}`, object: { sha } });
    }
    if (/^\/repos\/[^/]+\/[^/]+\/git\/refs$/.test(path) && method === 'POST') {
      const name = stringField(body, 'ref');
      const branch = name.replace('refs/heads/', '');
      if (this.refs.has(branch)) return json(422, { message: 'Reference already exists' });
      this.refs.set(branch, stringField(body, 'sha'));
      return json(201, { ref: name, object: { sha: body?.['sha'] } });
    }
    const branch = /^\/repos\/[^/]+\/[^/]+\/git\/refs\/heads\/(.+)$/.exec(path);
    if (branch !== null && method === 'PATCH') {
      const name = branch[1] ?? '';
      if (!this.refs.has(name)) return json(404, { message: 'Not Found' });
      const sha = stringField(body, 'sha');
      this.refs.set(name, sha);
      return json(200, { ref: `refs/heads/${name}`, object: { sha } });
    }
    return null;
  }

  private handlePulls(
    method: string,
    url: URL,
    body: Record<string, unknown> | undefined,
  ): HttpResponse | null {
    const path = url.pathname;
    if (/^\/repos\/[^/]+\/[^/]+\/pulls$/.test(path)) {
      if (method === 'POST') return this.createPull(body);
      if (method === 'GET') return this.listPulls(url);
      return null;
    }
    const pull = /^\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)$/.exec(path);
    if (pull !== null) return this.handlePullItem(method, Number(pull[1]), body);
    const reviews = /^\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)\/reviews$/.exec(path);
    if (reviews !== null && method === 'GET') {
      return json(200, [...(this.reviews.get(Number(reviews[1])) ?? [])]);
    }
    return null;
  }

  private handlePullItem(
    method: string,
    number: number,
    body: Record<string, unknown> | undefined,
  ): HttpResponse | null {
    if (method === 'GET') {
      const record = this.pulls.get(number);
      if (record === undefined) return json(404, { message: 'Not Found' });
      return json(200, this.pullPayload(record));
    }
    if (method !== 'PATCH') return null;
    const record = this.pulls.get(number);
    if (record === undefined) return json(404, { message: 'Not Found' });
    if (typeof body?.['title'] === 'string') record.title = body['title'];
    return json(200, this.pullPayload(record));
  }

  private createPull(body: Record<string, unknown> | undefined): HttpResponse {
    const head = stringField(body, 'head');
    const base = stringField(body, 'base', 'main');
    const headSha = this.refs.get(head);
    if (headSha === undefined || headSha === this.refs.get(base)) {
      // GitHub refuses a pull request whose head has no commits ahead of base.
      return json(422, { message: `No commits between ${base} and ${head}` });
    }
    const record: PullRecord = {
      number: this.nextNumber++,
      title: stringField(body, 'title'),
      body: stringField(body, 'body'),
      state: 'open',
      merged: false,
      draft: Boolean(body?.['draft']),
      head,
      base,
      labels: [],
    };
    this.pulls.set(record.number, record);
    return json(201, this.pullPayload(record));
  }

  private listPulls(url: URL): HttpResponse {
    const head = url.searchParams.get('head');
    const list = [...this.pulls.values()].filter(
      (pull) => head === null || `${this.owner}:${pull.head}` === head || pull.head === head,
    );
    return json(
      200,
      list.map((pull) => this.pullPayload(pull)),
    );
  }
}
