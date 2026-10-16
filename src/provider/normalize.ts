import type {
  Actor,
  IssueRef,
  NormalizedEvent,
  PullRequestRef,
  ReviewState,
} from '../domain/types.js';

/** Provider-native GitHub review states mapped to the normalized model. */
const GITHUB_REVIEW_STATES: Record<string, ReviewState> = {
  approved: 'approved',
  changes_requested: 'changes_requested',
  commented: 'commented',
};

/**
 * Map a GitHub review state to the normalized model. Returns `null` for states
 * the orchestrator ignores (for example `dismissed` or `pending`).
 */
export function normalizeGithubReviewState(native: string): ReviewState | null {
  return GITHUB_REVIEW_STATES[native] ?? null;
}

/** The normalized event kind a submitted review of a given state produces. */
export function reviewKindForState(state: ReviewState): NormalizedEvent['kind'] {
  if (state === 'approved') return 'approval';
  if (state === 'changes_requested') return 'changes_requested';
  return 'conversation_comment';
}

export interface ReviewEventInput {
  id: string;
  at: string;
  actor: Actor;
  state: ReviewState;
  body?: string;
  issue?: IssueRef;
  pullRequest?: PullRequestRef;
}

/** Build a normalized event from a submitted review. */
export function reviewEvent(input: ReviewEventInput): NormalizedEvent {
  const event: NormalizedEvent = {
    kind: reviewKindForState(input.state),
    origin: 'review',
    id: input.id,
    at: input.at,
    actor: input.actor,
    reviewState: input.state,
  };
  if (input.issue !== undefined) event.issue = input.issue;
  if (input.pullRequest !== undefined) event.pullRequest = input.pullRequest;
  if (input.body !== undefined) event.body = input.body;
  return event;
}
