import type { Actor, IssueRef, PullRequestRef, RepoRef } from '../../domain/types.js';
import type {
  CloneInput,
  CreatePullRequestInput,
  FetchInput,
  ProviderComment,
  ProviderIssue,
  ProviderPullRequest,
  ProviderReview,
  PushInput,
  RepoProvider,
  ThreadTarget,
  UpdatePullRequestInput,
} from '../types.js';
import { defaultIssueBranch } from '../types.js';
import type { GitHubCloner } from './clone.js';
import {
  isPullRequestPayload,
  mapActor,
  mapComment,
  mapIssue,
  mapPullRequest,
  mapReview,
  type GithubCommentPayload,
  type GithubIssuePayload,
  type GithubPullPayload,
  type GithubReviewPayload,
  type GithubUser,
} from './map.js';
import { GitHubApiError, type GitHubTransport } from './transport.js';

export interface GitHubProviderOptions {
  repo: RepoRef;
  /** Executes host operations; inject `gh` or direct REST as appropriate. */
  transport: GitHubTransport;
  /** Clones the workflow branch into a turn workspace. */
  cloner: GitHubCloner;
}

/** A `RepoProvider` backed by GitHub, over an injectable transport. */
export class GitHubProvider implements RepoProvider {
  readonly id = 'github';
  readonly repo: RepoRef;
  readonly transport: GitHubTransport;

  private readonly cloner: GitHubCloner;

  constructor(options: GitHubProviderOptions) {
    this.repo = options.repo;
    this.transport = options.transport;
    this.cloner = options.cloner;
  }

  private repoPath(): string {
    return `/repos/${this.repo.owner}/${this.repo.name}`;
  }

  async botIdentity(): Promise<Actor> {
    const { data, status } = await this.transport.json<GithubUser>('GET', '/user');
    if (data === null) throw new GitHubApiError('GET /user returned no body', status);
    return mapActor(data);
  }

  async getIssue(issue: IssueRef): Promise<ProviderIssue | null> {
    const { data, status } = await this.transport.json<GithubIssuePayload>(
      'GET',
      `${this.repoPath()}/issues/${issue.number}`,
    );
    if (status === 304 || data === null || isPullRequestPayload(data)) return null;
    return mapIssue(this.repo, data);
  }

  async listTriggerIssues(triggerLabel: string): Promise<ProviderIssue[]> {
    const payloads = await this.transport.paginate<GithubIssuePayload>(
      `${this.repoPath()}/issues`,
      {
        state: 'open',
        labels: triggerLabel,
      },
    );
    return payloads
      .filter((payload) => !isPullRequestPayload(payload))
      .map((payload) => mapIssue(this.repo, payload));
  }

  async createDraftPullRequest(input: CreatePullRequestInput): Promise<ProviderPullRequest> {
    const branch = input.branch ?? defaultIssueBranch(input.issue);

    const baseRef = await this.transport.json<{ object: { sha: string } }>(
      'GET',
      `${this.repoPath()}/git/ref/heads/${input.baseBranch}`,
    );
    const sha = baseRef.data?.object.sha;
    if (sha === undefined) {
      throw new GitHubApiError(`could not resolve base ref '${input.baseBranch}'`, baseRef.status);
    }
    await this.ensureWorkflowBranch(branch, sha);
    const created = await this.transport.json<GithubPullPayload>(
      'POST',
      `${this.repoPath()}/pulls`,
      {
        body: {
          title: input.title,
          body: input.body,
          head: branch,
          base: input.baseBranch,
          draft: input.draft,
        },
      },
    );
    if (created.data === null) {
      throw new GitHubApiError('create pull request returned no body', created.status);
    }
    const pullRequest = mapPullRequest(this.repo, created.data);
    pullRequest.linkedIssue = input.issue;
    return pullRequest;
  }

  /**
   * Create `branch` so it has at least one commit ahead of the base. GitHub
   * rejects a pull request when its head branch has no commits between it and
   * the base, but the orchestrator opens the draft pull request before the
   * first propose turn commits, so the branch is seeded with an empty commit
   * (the base tree with a new parent) that the pull request can target.
   *
   * `branch` may already exist, left behind by an earlier attempt. Because this
   * runs only when the issue has no active pull request, such a branch is reset
   * to the current base rather than reused: a stale branch is what let a
   * workflow start many commits behind the base.
   */
  private async ensureWorkflowBranch(branch: string, baseSha: string): Promise<void> {
    const seedSha = await this.seedCommit(baseSha);
    try {
      await this.transport.json('POST', `${this.repoPath()}/git/refs`, {
        body: { ref: `refs/heads/${branch}`, sha: seedSha },
      });
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 422) throw error;
      await this.transport.json('PATCH', `${this.repoPath()}/git/refs/heads/${branch}`, {
        body: { sha: seedSha, force: true },
      });
    }
  }

  /** A commit with the base commit's tree but one commit ahead of `baseSha`. */
  private async seedCommit(baseSha: string): Promise<string> {
    const baseCommit = await this.transport.json<{ tree: { sha: string } }>(
      'GET',
      `${this.repoPath()}/git/commits/${baseSha}`,
    );
    const tree = baseCommit.data?.tree.sha;
    if (tree === undefined) {
      throw new GitHubApiError('could not resolve base commit tree', baseCommit.status);
    }
    const created = await this.transport.json<{ sha: string }>(
      'POST',
      `${this.repoPath()}/git/commits`,
      { body: { message: 'Start OpenSpec workflow', tree, parents: [baseSha] } },
    );
    const sha = created.data?.sha;
    if (sha === undefined) {
      throw new GitHubApiError('could not create workflow seed commit', created.status);
    }
    return sha;
  }

  async getPullRequest(pullRequest: PullRequestRef): Promise<ProviderPullRequest | null> {
    const { data, status } = await this.transport.json<GithubPullPayload>(
      'GET',
      `${this.repoPath()}/pulls/${pullRequest.number}`,
    );
    if (status === 304 || data === null) return null;
    return mapPullRequest(this.repo, data);
  }

  /**
   * GitHub exposes no REST endpoint for releasing a draft, so the transition
   * goes through the `markPullRequestReadyForReview` GraphQL mutation. The
   * REST pull payload carries the GraphQL node id the mutation needs.
   */
  async markPullRequestReady(pullRequest: PullRequestRef): Promise<void> {
    const { data, status } = await this.transport.json<GithubPullPayload>(
      'GET',
      `${this.repoPath()}/pulls/${pullRequest.number}`,
    );
    const nodeId = data?.node_id;
    if (nodeId === undefined) {
      throw new GitHubApiError(
        `could not resolve node id for pull request #${pullRequest.number}`,
        status,
      );
    }
    await this.transport.graphql(
      `mutation MarkPullRequestReady($pullRequestId: ID!) {
        markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
          pullRequest { id isDraft }
        }
      }`,
      { pullRequestId: nodeId },
    );
  }

  /** Update a pull request's title through the REST `PATCH /pulls/{number}` endpoint. */
  async updatePullRequest(
    pullRequest: PullRequestRef,
    input: UpdatePullRequestInput,
  ): Promise<void> {
    await this.transport.json('PATCH', `${this.repoPath()}/pulls/${pullRequest.number}`, {
      body: { title: input.title },
    });
  }

  async listPullRequestsForIssue(issue: IssueRef): Promise<ProviderPullRequest[]> {
    const branch = defaultIssueBranch(issue);
    const payloads = await this.transport.paginate<GithubPullPayload>(`${this.repoPath()}/pulls`, {
      state: 'all',
      head: `${this.repo.owner}:${branch}`,
    });
    return payloads.map((payload) => mapPullRequest(this.repo, payload));
  }

  async listPullRequestsWithLabel(label: string): Promise<ProviderPullRequest[]> {
    const payloads = await this.transport.paginate<GithubIssuePayload>(
      `${this.repoPath()}/issues`,
      {
        state: 'all',
        labels: label,
      },
    );
    const numbers = payloads
      .filter((payload) => isPullRequestPayload(payload))
      .map((payload) => payload.number);

    // The per-number reads are independent, so resolve them concurrently while
    // keeping the host's order in the result.
    const pullRequests = await Promise.all(
      numbers.map((number) => this.getPullRequest({ repo: this.repo, number })),
    );
    return pullRequests.filter(
      (pullRequest): pullRequest is ProviderPullRequest => pullRequest !== null,
    );
  }

  async addLabels(target: ThreadTarget, labels: string[]): Promise<void> {
    await this.ensureLabelsExist(labels);
    await this.transport.json('POST', `${this.repoPath()}/issues/${target.ref.number}/labels`, {
      body: { labels },
    });
  }

  /**
   * GitHub only applies labels that are defined on the repository, so a
   * lifecycle label (proposing, ready, ...) is created on first use. This keeps
   * a fresh repository zero-setup: labeling an issue `openspec` is enough.
   */
  private async ensureLabelsExist(labels: string[]): Promise<void> {
    if (labels.length === 0) return;
    const existing = await this.transport.paginate<{ name: string }>(`${this.repoPath()}/labels`);
    const known = new Set(existing.map((label) => label.name));
    const missing = [...new Set(labels)].filter((name) => !known.has(name));
    // Creating the missing labels is independent and idempotent, so do it
    // concurrently rather than one request at a time.
    await Promise.all(
      missing.map((name) =>
        this.transport.json('POST', `${this.repoPath()}/labels`, {
          body: { name, color: 'ededed' },
        }),
      ),
    );
  }

  async removeLabel(target: ThreadTarget, label: string): Promise<void> {
    try {
      await this.transport.json(
        'DELETE',
        `${this.repoPath()}/issues/${target.ref.number}/labels/${encodeURIComponent(label)}`,
      );
    } catch (error) {
      // GitHub answers 404 when the label is not currently applied to the
      // target. Removing a label that is not there is a no-op, so phase
      // transitions must not fail on it.
      if (error instanceof GitHubApiError && error.status === 404) return;
      throw error;
    }
  }

  async comment(target: ThreadTarget, body: string): Promise<void> {
    await this.transport.json('POST', `${this.repoPath()}/issues/${target.ref.number}/comments`, {
      body: { body },
    });
  }

  async listComments(target: ThreadTarget): Promise<ProviderComment[]> {
    const payloads = await this.transport.paginate<GithubCommentPayload>(
      `${this.repoPath()}/issues/${target.ref.number}/comments`,
    );
    return payloads.map(mapComment);
  }

  async listReviews(pullRequest: PullRequestRef): Promise<ProviderReview[]> {
    const payloads = await this.transport.paginate<GithubReviewPayload>(
      `${this.repoPath()}/pulls/${pullRequest.number}/reviews`,
    );
    return payloads.map(mapReview).filter((review): review is ProviderReview => review !== null);
  }

  async clone(input: CloneInput): Promise<void> {
    await this.cloner.clone(input);
  }

  async fetch(input: FetchInput): Promise<void> {
    await this.cloner.fetch(input);
  }

  async push(input: PushInput): Promise<void> {
    await this.cloner.push(input);
  }
}
