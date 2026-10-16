import type {
  Actor,
  IssueRef,
  PullRequestRef,
  RepoRef,
  ReviewState,
} from '../domain/types.js';

/** A conversation target: an issue or a pull request (merge request). */
export type ThreadTarget =
  | { kind: 'issue'; ref: IssueRef }
  | { kind: 'pull_request'; ref: PullRequestRef };

export interface ProviderIssue {
  ref: IssueRef;
  title: string;
  body: string;
  labels: string[];
  state: 'open' | 'closed';
}

export interface ProviderPullRequest {
  ref: PullRequestRef;
  title: string;
  body: string;
  branch: string;
  baseBranch: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  labels: string[];
  linkedIssue?: IssueRef;
}

export interface ProviderReview {
  id: string;
  author: Actor;
  state: ReviewState;
  body: string;
  at: string;
}

export interface ProviderComment {
  id: string;
  author: Actor;
  body: string;
  at: string;
}

export interface CreatePullRequestInput {
  issue: IssueRef;
  baseBranch: string;
  title: string;
  body: string;
  draft: boolean;
  /** Optional explicit branch name; a provider uses its own convention when omitted. */
  branch?: string;
}

export interface CloneInput {
  branch: string;
  destination: string;
  /** Clone full history and every branch; omitted means a shallow single-branch clone. */
  full?: boolean;
}

export interface FetchInput {
  /** An existing clone to refresh from the host. */
  destination: string;
}

/** Branch naming convention for a workflow started from an issue. */
export function defaultIssueBranch(issue: IssueRef): string {
  return `openspec/issue-${issue.number}`;
}

/**
 * The host abstraction. A provider instance is bound to a single repository
 * (it holds that repository's credential). Everything the orchestrator needs
 * from a host goes through this interface so hosts can be added or replaced
 * without touching orchestration.
 */
export interface RepoProvider {
  readonly id: string;
  readonly repo: RepoRef;

  botIdentity(): Promise<Actor>;

  getIssue(issue: IssueRef): Promise<ProviderIssue | null>;
  listTriggerIssues(triggerLabel: string): Promise<ProviderIssue[]>;

  createDraftPullRequest(input: CreatePullRequestInput): Promise<ProviderPullRequest>;
  getPullRequest(pullRequest: PullRequestRef): Promise<ProviderPullRequest | null>;
  listPullRequestsForIssue(issue: IssueRef): Promise<ProviderPullRequest[]>;
  /** All pull requests carrying a label, in any state (used to resume work). */
  listPullRequestsWithLabel(label: string): Promise<ProviderPullRequest[]>;

  addLabels(target: ThreadTarget, labels: string[]): Promise<void>;
  removeLabel(target: ThreadTarget, label: string): Promise<void>;

  comment(target: ThreadTarget, body: string): Promise<void>;
  listComments(target: ThreadTarget): Promise<ProviderComment[]>;

  listReviews(pullRequest: PullRequestRef): Promise<ProviderReview[]>;

  clone(input: CloneInput): Promise<void>;
  /** Refresh an existing clone with the host's latest refs, using clone's credentials. */
  fetch(input: FetchInput): Promise<void>;
}
