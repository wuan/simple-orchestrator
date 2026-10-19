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

  async request(input: HttpRequest): Promise<HttpResponse> {
    const url = new URL(input.url);
    const path = url.pathname;
    this.calls.push({ method: input.method, path });

    const body =
      input.body === undefined ? undefined : (JSON.parse(input.body) as Record<string, unknown>);

    // /user
    if (input.method === 'GET' && path === '/user') {
      return json(200, { login: this.botLogin, type: 'Bot' });
    }

    // /graphql
    if (input.method === 'POST' && path === '/graphql') {
      const query = String(body?.['query'] ?? '');
      const variables = (body?.['variables'] as Record<string, unknown> | undefined) ?? {};
      if (!query.includes('markPullRequestReadyForReview')) {
        return json(200, { errors: [{ message: 'unsupported GraphQL operation' }] });
      }
      const pullRequestId = String(variables['pullRequestId'] ?? '');
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

    const repoLabelsMatch = /^\/repos\/[^/]+\/[^/]+\/labels$/.exec(path);
    if (repoLabelsMatch !== null) {
      if (input.method === 'GET') {
        return json(
          200,
          [...this.repoLabels].map((name) => ({ name })),
        );
      }
      if (input.method === 'POST') {
        const name = String(body?.['name'] ?? '');
        this.repoLabels.add(name);
        return json(201, { name });
      }
    }

    const issuesMatch = /^\/repos\/[^/]+\/[^/]+\/issues$/.exec(path);
    if (issuesMatch !== null && input.method === 'GET') {
      const labelFilter = url.searchParams.get('labels');
      const stateFilter = url.searchParams.get('state');
      const stateAllows = (state: string): boolean =>
        stateFilter === null || stateFilter === 'all' || stateFilter === state;
      const issueList = [...this.issues.values()].filter(
        (issue) =>
          stateAllows(issue.state) && (labelFilter === null || issue.labels.includes(labelFilter)),
      );
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
      return json(200, [...issueList.map((issue) => this.issuePayload(issue)), ...pullAsIssues]);
    }

    const issueMatch = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/.exec(path);
    if (issueMatch !== null && input.method === 'GET') {
      const number = Number(issueMatch[1]);
      const record = this.issues.get(number);
      if (record === undefined) return json(404, { message: 'Not Found' });
      return json(200, this.issuePayload(record));
    }

    const labelsMatch = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/labels$/.exec(path);
    if (labelsMatch !== null && input.method === 'POST') {
      const number = Number(labelsMatch[1]);
      const target = this.resolveLabels(number);
      const incoming = (body?.['labels'] as string[] | undefined) ?? [];
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

    const labelMatch = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/labels\/(.+)$/.exec(path);
    if (labelMatch !== null && input.method === 'DELETE') {
      const number = Number(labelMatch[1]);
      const label = decodeURIComponent(labelMatch[2] ?? '');
      const target = this.resolveLabels(number);
      const index = target?.indexOf(label) ?? -1;
      if (target === undefined || index < 0) {
        return json(404, { message: 'Label does not exist' });
      }
      target.splice(index, 1);
      return { status: 200, headers: {}, text: '' };
    }

    const commentsMatch = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments$/.exec(path);
    if (commentsMatch !== null) {
      const number = Number(commentsMatch[1]);
      if (input.method === 'GET') return json(200, [...(this.comments.get(number) ?? [])]);
      if (input.method === 'POST') {
        const list = this.comments.get(number) ?? [];
        const record: CommentRecord = {
          id: this.nextId++,
          user: { login: this.botLogin, type: 'Bot' },
          body: String(body?.['body'] ?? ''),
          created_at: this.tick(),
        };
        list.push(record);
        this.comments.set(number, list);
        return json(201, record);
      }
    }

    const refMatch = /^\/repos\/[^/]+\/[^/]+\/git\/ref\/heads\/(.+)$/.exec(path);
    if (refMatch !== null && input.method === 'GET') {
      const branch = refMatch[1] ?? '';
      const sha = this.refs.get(branch);
      if (sha === undefined) return json(404, { message: 'Reference does not exist' });
      return json(200, { ref: `refs/heads/${branch}`, object: { sha } });
    }

    const commitMatch = /^\/repos\/[^/]+\/[^/]+\/git\/commits\/(.+)$/.exec(path);
    if (commitMatch !== null && input.method === 'GET') {
      const sha = commitMatch[1] ?? '';
      const commit = this.commits.get(sha);
      if (commit === undefined) return json(404, { message: 'Not Found' });
      return json(200, { sha, tree: { sha: commit.tree }, parents: commit.parents });
    }

    const commitsMatch = /^\/repos\/[^/]+\/[^/]+\/git\/commits$/.exec(path);
    if (commitsMatch !== null && input.method === 'POST') {
      const tree = String(body?.['tree'] ?? '');
      const parents = (body?.['parents'] as string[] | undefined) ?? [];
      const sha = `commit-${this.nextCommit++}`;
      this.commits.set(sha, { tree, parents });
      return json(201, { sha, tree: { sha: tree }, parents });
    }

    const refsMatch = /^\/repos\/[^/]+\/[^/]+\/git\/refs$/.exec(path);
    if (refsMatch !== null && input.method === 'POST') {
      const ref = String(body?.['ref'] ?? '');
      const branch = ref.replace('refs/heads/', '');
      if (this.refs.has(branch)) {
        return json(422, { message: 'Reference already exists' });
      }
      this.refs.set(branch, String(body?.['sha'] ?? ''));
      return json(201, { ref, object: { sha: body?.['sha'] } });
    }

    const refBranchMatch = /^\/repos\/[^/]+\/[^/]+\/git\/refs\/heads\/(.+)$/.exec(path);
    if (refBranchMatch !== null && input.method === 'PATCH') {
      const branch = refBranchMatch[1] ?? '';
      if (!this.refs.has(branch)) return json(404, { message: 'Not Found' });
      const sha = String(body?.['sha'] ?? '');
      this.refs.set(branch, sha);
      return json(200, { ref: `refs/heads/${branch}`, object: { sha } });
    }

    const pullsMatch = /^\/repos\/[^/]+\/[^/]+\/pulls$/.exec(path);
    if (pullsMatch !== null && input.method === 'POST') {
      const head = String(body?.['head'] ?? '');
      const base = String(body?.['base'] ?? 'main');
      const headSha = this.refs.get(head);
      if (headSha === undefined || headSha === this.refs.get(base)) {
        // GitHub refuses a pull request whose head has no commits ahead of base.
        return json(422, { message: `No commits between ${base} and ${head}` });
      }
      const record: PullRecord = {
        number: this.nextNumber++,
        title: String(body?.['title'] ?? ''),
        body: String(body?.['body'] ?? ''),
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

    if (pullsMatch !== null && input.method === 'GET') {
      const head = url.searchParams.get('head');
      const list = [...this.pulls.values()].filter(
        (pull) => head === null || `${this.owner}:${pull.head}` === head || pull.head === head,
      );
      return json(
        200,
        list.map((pull) => this.pullPayload(pull)),
      );
    }

    const pullMatch = /^\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)$/.exec(path);
    if (pullMatch !== null && input.method === 'GET') {
      const record = this.pulls.get(Number(pullMatch[1]));
      if (record === undefined) return json(404, { message: 'Not Found' });
      return json(200, this.pullPayload(record));
    }

    if (pullMatch !== null && input.method === 'PATCH') {
      const record = this.pulls.get(Number(pullMatch[1]));
      if (record === undefined) return json(404, { message: 'Not Found' });
      if (typeof body?.['title'] === 'string') record.title = body['title'];
      return json(200, this.pullPayload(record));
    }

    const reviewsMatch = /^\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)\/reviews$/.exec(path);
    if (reviewsMatch !== null && input.method === 'GET') {
      return json(200, [...(this.reviews.get(Number(reviewsMatch[1])) ?? [])]);
    }

    return json(404, { message: `no route for ${input.method} ${path}` });
  }
}
