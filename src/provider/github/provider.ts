import type { Actor, IssueRef, PullRequestRef, RepoRef } from '../../domain/types.js';
import { FetchHttpClient, type HttpClient } from '../../http/client.js';
import type {
  CloneInput,
  CreatePullRequestInput,
  ProviderComment,
  ProviderIssue,
  ProviderPullRequest,
  ProviderReview,
  RepoProvider,
  ThreadTarget,
} from '../types.js';
import { defaultIssueBranch } from '../types.js';
import { NodeCommandRunner, type CommandRunner } from './commands.js';
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
import { GitHubApiError, GitHubRest } from './rest.js';

export interface GitHubProviderOptions {
  repo: RepoRef;
  token: string;
  http?: HttpClient;
  commands?: CommandRunner;
  apiBaseUrl?: string;
  gitBaseUrl?: string;
  userAgent?: string;
  rateLimitFloor?: number;
}

/** A `RepoProvider` backed by the GitHub REST API. */
export class GitHubProvider implements RepoProvider {
  readonly id = 'github';
  readonly repo: RepoRef;
  readonly rest: GitHubRest;

  private readonly token: string;
  private readonly commands: CommandRunner;
  private readonly gitBaseUrl: string;

  constructor(options: GitHubProviderOptions) {
    this.repo = options.repo;
    this.token = options.token;
    this.rest = new GitHubRest({
      token: options.token,
      http: options.http ?? new FetchHttpClient(),
      baseUrl: options.apiBaseUrl,
      userAgent: options.userAgent,
      rateLimitFloor: options.rateLimitFloor,
    });
    this.commands = options.commands ?? new NodeCommandRunner();
    this.gitBaseUrl = options.gitBaseUrl ?? 'https://github.com';
  }

  private repoPath(): string {
    return `/repos/${this.repo.owner}/${this.repo.name}`;
  }

  async botIdentity(): Promise<Actor> {
    const { data, status } = await this.rest.json<GithubUser>('GET', '/user');
    if (data === null) throw new GitHubApiError('GET /user returned no body', status);
    return mapActor(data);
  }

  async getIssue(issue: IssueRef): Promise<ProviderIssue | null> {
    const { data, status } = await this.rest.json<GithubIssuePayload>(
      'GET',
      `${this.repoPath()}/issues/${issue.number}`,
    );
    if (status === 304 || data === null || isPullRequestPayload(data)) return null;
    return mapIssue(this.repo, data);
  }

  async listTriggerIssues(triggerLabel: string): Promise<ProviderIssue[]> {
    const payloads = await this.rest.paginate<GithubIssuePayload>(`${this.repoPath()}/issues`, {
      state: 'open',
      labels: triggerLabel,
    });
    return payloads
      .filter((payload) => !isPullRequestPayload(payload))
      .map((payload) => mapIssue(this.repo, payload));
  }

  async createDraftPullRequest(input: CreatePullRequestInput): Promise<ProviderPullRequest> {
    const branch = input.branch ?? defaultIssueBranch(input.issue);

    const baseRef = await this.rest.json<{ object: { sha: string } }>(
      'GET',
      `${this.repoPath()}/git/ref/heads/${input.baseBranch}`,
    );
    const sha = baseRef.data?.object.sha;
    if (sha === undefined) {
      throw new GitHubApiError(`could not resolve base ref '${input.baseBranch}'`, baseRef.status);
    }
    await this.rest.json('POST', `${this.repoPath()}/git/refs`, {
      body: { ref: `refs/heads/${branch}`, sha },
    });
    const created = await this.rest.json<GithubPullPayload>('POST', `${this.repoPath()}/pulls`, {
      body: {
        title: input.title,
        body: input.body,
        head: branch,
        base: input.baseBranch,
        draft: input.draft,
      },
    });
    if (created.data === null) {
      throw new GitHubApiError('create pull request returned no body', created.status);
    }
    const pullRequest = mapPullRequest(this.repo, created.data);
    pullRequest.linkedIssue = input.issue;
    return pullRequest;
  }

  async getPullRequest(pullRequest: PullRequestRef): Promise<ProviderPullRequest | null> {
    const { data, status } = await this.rest.json<GithubPullPayload>(
      'GET',
      `${this.repoPath()}/pulls/${pullRequest.number}`,
    );
    if (status === 304 || data === null) return null;
    return mapPullRequest(this.repo, data);
  }

  async listPullRequestsForIssue(issue: IssueRef): Promise<ProviderPullRequest[]> {
    const branch = defaultIssueBranch(issue);
    const payloads = await this.rest.paginate<GithubPullPayload>(`${this.repoPath()}/pulls`, {
      state: 'all',
      head: `${this.repo.owner}:${branch}`,
    });
    return payloads.map((payload) => mapPullRequest(this.repo, payload));
  }

  async listPullRequestsWithLabel(label: string): Promise<ProviderPullRequest[]> {
    const payloads = await this.rest.paginate<GithubIssuePayload>(`${this.repoPath()}/issues`, {
      state: 'all',
      labels: label,
    });
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
    await this.rest.json('POST', `${this.repoPath()}/issues/${target.ref.number}/labels`, {
      body: { labels },
    });
  }

  async removeLabel(target: ThreadTarget, label: string): Promise<void> {
    await this.rest.json(
      'DELETE',
      `${this.repoPath()}/issues/${target.ref.number}/labels/${encodeURIComponent(label)}`,
    );
  }

  async comment(target: ThreadTarget, body: string): Promise<void> {
    await this.rest.json('POST', `${this.repoPath()}/issues/${target.ref.number}/comments`, {
      body: { body },
    });
  }

  async listComments(target: ThreadTarget): Promise<ProviderComment[]> {
    const payloads = await this.rest.paginate<GithubCommentPayload>(
      `${this.repoPath()}/issues/${target.ref.number}/comments`,
    );
    return payloads.map(mapComment);
  }

  async listReviews(pullRequest: PullRequestRef): Promise<ProviderReview[]> {
    const payloads = await this.rest.paginate<GithubReviewPayload>(
      `${this.repoPath()}/pulls/${pullRequest.number}/reviews`,
    );
    return payloads.map(mapReview).filter((review): review is ProviderReview => review !== null);
  }

  async clone(input: CloneInput): Promise<void> {
    const url = `${this.gitBaseUrl}/${this.repo.owner}/${this.repo.name}.git`;
    // The token is passed through git's environment-based config so it never
    // appears in the process argument list.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.extraheader',
      GIT_CONFIG_VALUE_0: `Authorization: Bearer ${this.token}`,
    };
    const result = await this.commands.run(
      'git',
      ['clone', '--branch', input.branch, '--single-branch', '--depth', '1', url, input.destination],
      { env },
    );
    if (result.code !== 0) {
      throw new GitHubApiError(`git clone failed (${result.code}): ${result.stderr}`, result.code);
    }
  }
}
