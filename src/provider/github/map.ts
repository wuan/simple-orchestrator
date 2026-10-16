import type { Actor, RepoRef } from '../../domain/types.js';
import { normalizeGithubReviewState } from '../normalize.js';
import type { ProviderComment, ProviderIssue, ProviderPullRequest, ProviderReview } from '../types.js';

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
}

export interface GithubPullPayload {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft?: boolean;
  merged_at?: string | null;
  head: { ref: string };
  base: { ref: string };
  labels?: GithubLabel[];
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
  return {
    ref: { repo, number: payload.number },
    title: payload.title,
    body: payload.body ?? '',
    labels: labelNames(payload.labels),
    state: payload.state === 'closed' ? 'closed' : 'open',
  };
}

export function mapPullRequest(repo: RepoRef, payload: GithubPullPayload): ProviderPullRequest {
  const state = payload.merged_at ? 'merged' : payload.state === 'closed' ? 'closed' : 'open';
  return {
    ref: { repo, number: payload.number },
    title: payload.title,
    body: payload.body ?? '',
    branch: payload.head.ref,
    baseBranch: payload.base.ref,
    state,
    draft: payload.draft ?? false,
    labels: labelNames(payload.labels),
  };
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
