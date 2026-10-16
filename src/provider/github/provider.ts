import type { Actor, IssueRef, PullRequestRef, RepoRef } from '../../domain/types.js';
import type {
  CloneInput,
  CreatePullRequestInput,
  FetchInput,
  ProviderComment,
  ProviderIssue,
  ProviderPullRequest,
  ProviderReview,
  RepoProvider,
  ThreadTarget,
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
    await this.transport.json('POST', `${this.repoPath()}/git/refs`, {
      body: { ref: `refs/heads/${branch}`, sha },
    });
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

  async getPullRequest(pullRequest: PullRequestRef): Promise<ProviderPullRequest | null> {
    const { data, status } = await this.transport.json<GithubPullPayload>(
      'GET',
      `${this.repoPath()}/pulls/${pullRequest.number}`,
    );
    if (status === 304 || data === null) return null;
    return mapPullRequest(this.repo, data);
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

    const pullRequests: ProviderPullRequest[] = [];
    for (const number of numbers) {
      const pullRequest = await this.getPullRequest({ repo: this.repo, number });
      if (pullRequest !== null) pullRequests.push(pullRequest);
    }
    return pullRequests;
  }

  async addLabels(target: ThreadTarget, labels: string[]): Promise<void> {
    await this.transport.json('POST', `${this.repoPath()}/issues/${target.ref.number}/labels`, {
      body: { labels },
    });
  }

  async removeLabel(target: ThreadTarget, label: string): Promise<void> {
    await this.transport.json(
      'DELETE',
      `${this.repoPath()}/issues/${target.ref.number}/labels/${encodeURIComponent(label)}`,
    );
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
}
