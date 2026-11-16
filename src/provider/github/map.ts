import type { Actor, RepoRef } from '../../domain/types.js';
import { normalizeGithubReviewState } from '../normalize.js';
import type {
  ProviderComment,
  ProviderIssue,
  ProviderPullRequest,
  ProviderReview,
} from '../types.js';

export interface GithubUser {
  login: string;
  type?: string;
}

export type GithubLabel = { name: string } | string;

export interface GithubIssuePayload {
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels: GithubLabel[];
  pull_request?: unknown;
  /** The host's web URL for the issue. */
  html_url?: string | null;
}

export interface GithubPullPayload {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft?: boolean;
  merged_at?: string | null;
  /** GraphQL global node id, used to address pull request mutations. */
  node_id?: string;
  head: { ref: string };
  base: { ref: string };
  labels?: GithubLabel[];
  /** The host's web URL for the pull request. */
  html_url?: string | null;
}

export interface GithubReviewPayload {
  id: number;
  user: GithubUser;
  state: string;
  body: string | null;
  submitted_at?: string | null;
  commit_id?: string | null;
}

export interface GithubCommentPayload {
  id: number;
  user: GithubUser;
  body: string | null;
  created_at: string;
}

export function isBotUser(user: GithubUser): boolean {
  return user.type === 'Bot' || user.login.endsWith('[bot]');
}

export function mapActor(user: GithubUser): Actor {
  return { login: user.login, isBot: isBotUser(user) };
}

function labelNames(labels: GithubLabel[] | undefined): string[] {
  return (labels ?? []).map((label) => (typeof label === 'string' ? label : label.name));
}

/** GitHub returns pull requests from the issues endpoint; this filters them out. */
export function isPullRequestPayload(payload: GithubIssuePayload): boolean {
  return payload.pull_request !== undefined && payload.pull_request !== null;
}

export function mapIssue(repo: RepoRef, payload: GithubIssuePayload): ProviderIssue {
  const issue: ProviderIssue = {
    ref: { repo, number: payload.number },
    title: payload.title,
    body: payload.body ?? '',
    labels: labelNames(payload.labels),
    state: payload.state === 'closed' ? 'closed' : 'open',
  };
  if (typeof payload.html_url === 'string' && payload.html_url !== '') {
    issue.url = payload.html_url;
  }
  return issue;
}

function pullRequestState(payload: GithubPullPayload): 'open' | 'closed' | 'merged' {
  if (payload.merged_at) return 'merged';
  return payload.state === 'closed' ? 'closed' : 'open';
}

export function mapPullRequest(repo: RepoRef, payload: GithubPullPayload): ProviderPullRequest {
  const state = pullRequestState(payload);
  const pullRequest: ProviderPullRequest = {
    ref: { repo, number: payload.number },
    title: payload.title,
    body: payload.body ?? '',
    branch: payload.head.ref,
    baseBranch: payload.base.ref,
    state,
    draft: payload.draft ?? false,
    labels: labelNames(payload.labels),
  };
  if (payload.node_id !== undefined) pullRequest.nodeId = payload.node_id;
  if (typeof payload.html_url === 'string' && payload.html_url !== '') {
    pullRequest.url = payload.html_url;
  }
  return pullRequest;
}

/** Returns null for review states the orchestrator ignores (e.g. `dismissed`). */
export function mapReview(payload: GithubReviewPayload): ProviderReview | null {
  const state = normalizeGithubReviewState(payload.state);
  if (state === null) return null;
  return {
    id: String(payload.id),
    author: mapActor(payload.user),
    state,
    body: payload.body ?? '',
    at: payload.submitted_at ?? new Date(0).toISOString(),
  };
}

export function mapComment(payload: GithubCommentPayload): ProviderComment {
  return {
    id: String(payload.id),
    author: mapActor(payload.user),
    body: payload.body ?? '',
    at: payload.created_at,
  };
}
