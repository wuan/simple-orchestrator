import type { Actor, IssueRef, PullRequestRef, RepoRef, ReviewState } from '../../domain/types.js';
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
} from '../types.js';
import { defaultIssueBranch } from '../types.js';

export interface FakeProviderOptions {
  id?: string;
  repo?: RepoRef;
  bot?: Actor;
}

function targetKey(target: ThreadTarget): string {
  return target.kind === 'issue' ? `issue:${target.ref.number}` : `pr:${target.ref.number}`;
}

const HUMAN: Actor = { login: 'reviewer', isBot: false };

/**
 * An in-memory provider used by orchestration tests. It records the clone and
 * comment calls it receives and lets tests seed issues, pull requests, reviews,
 * and comments.
 */
export class FakeProvider implements RepoProvider {
  readonly id: string;
  readonly repo: RepoRef;

  private readonly bot: Actor;
  private readonly issues = new Map<number, ProviderIssue>();
  private readonly pulls = new Map<number, ProviderPullRequest>();
  private readonly reviews = new Map<number, ProviderReview[]>();
  private readonly comments = new Map<string, ProviderComment[]>();
  private nextPullNumber = 100;
  private commentSeq = 0;
  private clock = Date.parse('2026-01-01T00:00:00.000Z');

  readonly clones: CloneInput[] = [];
  readonly fetches: FetchInput[] = [];
  readonly pushes: PushInput[] = [];
  readonly commentLog: { target: ThreadTarget; body: string }[] = [];

  constructor(options: FakeProviderOptions = {}) {
    this.id = options.id ?? 'fake';
    this.repo = options.repo ?? { owner: 'acme', name: 'widget' };
    this.bot = options.bot ?? { login: 'openspec-bot', isBot: true };
  }

  private tick(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  // --- seeding helpers (test-only) -----------------------------------------

  seedIssue(input: {
    number: number;
    title?: string;
    body?: string;
    labels?: string[];
    state?: 'open' | 'closed';
  }): ProviderIssue {
    const issue: ProviderIssue = {
      ref: { repo: this.repo, number: input.number },
      title: input.title ?? `Issue ${input.number}`,
      body: input.body ?? '',
      labels: [...(input.labels ?? [])],
      state: input.state ?? 'open',
    };
    this.issues.set(input.number, issue);
    return issue;
  }

  seedPullRequest(input: {
    number: number;
    title?: string;
    body?: string;
    branch?: string;
    baseBranch?: string;
    state?: 'open' | 'closed' | 'merged';
    draft?: boolean;
    labels?: string[];
    linkedIssue?: number;
  }): ProviderPullRequest {
    const pr: ProviderPullRequest = {
      ref: { repo: this.repo, number: input.number },
      title: input.title ?? `Pull request ${input.number}`,
      body: input.body ?? '',
      branch: input.branch ?? `openspec/issue-${input.number}`,
      baseBranch: input.baseBranch ?? 'main',
      state: input.state ?? 'open',
      draft: input.draft ?? true,
      labels: [...(input.labels ?? [])],
    };
    if (input.linkedIssue !== undefined) {
      pr.linkedIssue = { repo: this.repo, number: input.linkedIssue };
    }
    this.pulls.set(input.number, pr);
    return pr;
  }

  seedReview(
    pullRequest: number,
    input: { state: ReviewState; author?: Actor; body?: string; id?: string; at?: string },
  ): ProviderReview {
    const review: ProviderReview = {
      id: input.id ?? `review-${this.reviews.get(pullRequest)?.length ?? 0}-${pullRequest}`,
      author: input.author ?? HUMAN,
      state: input.state,
      body: input.body ?? '',
      at: input.at ?? this.tick(),
    };
    const list = this.reviews.get(pullRequest) ?? [];
    list.push(review);
    this.reviews.set(pullRequest, list);
    return review;
  }

  seedComment(
    target: ThreadTarget,
    input: { author?: Actor; body?: string; id?: string; at?: string },
  ): ProviderComment {
    const comment: ProviderComment = {
      id: input.id ?? `comment-${++this.commentSeq}`,
      author: input.author ?? HUMAN,
      body: input.body ?? '',
      at: input.at ?? this.tick(),
    };
    const key = targetKey(target);
    const list = this.comments.get(key) ?? [];
    list.push(comment);
    this.comments.set(key, list);
    return comment;
  }

  setPullRequestState(number: number, state: 'open' | 'closed' | 'merged'): void {
    const pullRequest = this.pulls.get(number);
    if (pullRequest !== undefined) pullRequest.state = state;
  }

  // --- RepoProvider --------------------------------------------------------

  async botIdentity(): Promise<Actor> {
    return this.bot;
  }

  async getIssue(issue: IssueRef): Promise<ProviderIssue | null> {
    return this.issues.get(issue.number) ?? null;
  }

  async listTriggerIssues(triggerLabel: string): Promise<ProviderIssue[]> {
    return [...this.issues.values()].filter(
      (issue) => issue.state === 'open' && issue.labels.includes(triggerLabel),
    );
  }

  async createDraftPullRequest(input: CreatePullRequestInput): Promise<ProviderPullRequest> {
    const number = this.nextPullNumber++;
    const pr: ProviderPullRequest = {
      ref: { repo: this.repo, number },
      title: input.title,
      body: input.body,
      branch: input.branch ?? defaultIssueBranch(input.issue),
      baseBranch: input.baseBranch,
      state: 'open',
      draft: input.draft,
      labels: [],
      linkedIssue: input.issue,
    };
    this.pulls.set(number, pr);
    return { ...pr, labels: [...pr.labels] };
  }

  async getPullRequest(pullRequest: PullRequestRef): Promise<ProviderPullRequest | null> {
    return this.pulls.get(pullRequest.number) ?? null;
  }

  async listPullRequestsForIssue(issue: IssueRef): Promise<ProviderPullRequest[]> {
    return [...this.pulls.values()].filter((pr) => pr.linkedIssue?.number === issue.number);
  }

  async listPullRequestsWithLabel(label: string): Promise<ProviderPullRequest[]> {
    return [...this.pulls.values()].filter((pr) => pr.labels.includes(label));
  }

  private labelList(target: ThreadTarget): string[] | undefined {
    return target.kind === 'issue'
      ? this.issues.get(target.ref.number)?.labels
      : this.pulls.get(target.ref.number)?.labels;
  }

  async addLabels(target: ThreadTarget, labels: string[]): Promise<void> {
    const list = this.labelList(target);
    if (list === undefined) return;
    for (const label of labels) {
      if (!list.includes(label)) list.push(label);
    }
  }

  async removeLabel(target: ThreadTarget, label: string): Promise<void> {
    const list = this.labelList(target);
    if (list === undefined) return;
    const index = list.indexOf(label);
    if (index >= 0) list.splice(index, 1);
  }

  async comment(target: ThreadTarget, body: string): Promise<void> {
    this.commentLog.push({ target, body });
    this.seedComment(target, { author: this.bot, body });
  }

  async listComments(target: ThreadTarget): Promise<ProviderComment[]> {
    return [...(this.comments.get(targetKey(target)) ?? [])];
  }

  async listReviews(pullRequest: PullRequestRef): Promise<ProviderReview[]> {
    return [...(this.reviews.get(pullRequest.number) ?? [])];
  }

  async clone(input: CloneInput): Promise<void> {
    this.clones.push({ ...input });
  }

  async fetch(input: FetchInput): Promise<void> {
    this.fetches.push({ ...input });
  }

  async push(input: PushInput): Promise<void> {
    this.pushes.push({ ...input });
  }
}
