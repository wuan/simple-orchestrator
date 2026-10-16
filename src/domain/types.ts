/**
 * Core domain types for the orchestrator.
 *
 * These are deliberately provider- and runtime-agnostic: everything the
 * orchestration engine reasons about is expressed here, and the provider and
 * runtime layers translate to and from these shapes.
 */

// ---------------------------------------------------------------------------
// References and actors
// ---------------------------------------------------------------------------

export interface RepoRef {
  owner: string;
  name: string;
}

export interface IssueRef {
  repo: RepoRef;
  number: number;
}

export interface PullRequestRef {
  repo: RepoRef;
  number: number;
}

/** A person or bot that produced activity, as normalized by a provider. */
export interface Actor {
  login: string;
  isBot: boolean;
}

/** How a normalized event was produced on the host. */
export const EVENT_ORIGINS = ['review', 'comment', 'label', 'pull_request', 'system'] as const;
export type EventOrigin = (typeof EVENT_ORIGINS)[number];

// ---------------------------------------------------------------------------
// Review states and normalized events
// ---------------------------------------------------------------------------

export const REVIEW_STATES = ['commented', 'changes_requested', 'approved'] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

const REVIEW_STATE_SET: ReadonlySet<string> = new Set(REVIEW_STATES);

export function isReviewState(value: unknown): value is ReviewState {
  return typeof value === 'string' && REVIEW_STATE_SET.has(value);
}

/**
 * The common event set every provider normalizes to.
 *
 * Note: a submitted review whose state is `commented` arrives as a
 * `conversation_comment` event with `origin: 'review'`. A plain pull request
 * comment arrives as `conversation_comment` with `origin: 'comment'`. The
 * trigger rule (below) distinguishes the two, which is how "submitted reviews
 * drive turns, plain comments do not" is expressed without inventing a kind
 * that is not part of the provider contract.
 */
export const NORMALIZED_EVENT_KINDS = [
  'workflow_start',
  'changes_requested',
  'approval',
  'conversation_comment',
  'cancellation',
] as const;
export type NormalizedEventKind = (typeof NORMALIZED_EVENT_KINDS)[number];

const EVENT_KIND_SET: ReadonlySet<string> = new Set(NORMALIZED_EVENT_KINDS);

export function isNormalizedEventKind(value: unknown): value is NormalizedEventKind {
  return typeof value === 'string' && EVENT_KIND_SET.has(value);
}

export interface NormalizedEvent {
  kind: NormalizedEventKind;
  origin: EventOrigin;
  /** Provider-native identifier, used for idempotency where available. */
  id: string;
  /** ISO-8601 timestamp of when the activity happened on the host. */
  at: string;
  actor: Actor;
  issue?: IssueRef;
  pullRequest?: PullRequestRef;
  /** The submitted review state, when this event came from a review. */
  reviewState?: ReviewState;
  body?: string;
}

/**
 * Whether a normalized event should cause the orchestrator to run a turn.
 * Change requests and submitted reviews trigger; approvals are handled by the
 * gate; plain comments and cancellations do not trigger a turn.
 */
export function triggersTurn(event: NormalizedEvent): boolean {
  if (event.kind === 'changes_requested') return true;
  if (event.kind === 'conversation_comment') return event.origin === 'review';
  return false;
}

/** Whether a normalized event is the human approval that gates implementation. */
export function isApproval(event: NormalizedEvent): boolean {
  return event.kind === 'approval';
}

// ---------------------------------------------------------------------------
// Workflow phases
// ---------------------------------------------------------------------------

export const WORKFLOW_PHASES = ['proposing', 'ready', 'implementing', 'done', 'failed'] as const;
export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];

const PHASE_SET: ReadonlySet<string> = new Set(WORKFLOW_PHASES);

export function isWorkflowPhase(value: unknown): value is WorkflowPhase {
  return typeof value === 'string' && PHASE_SET.has(value);
}

const TRANSITIONS: Record<WorkflowPhase, readonly WorkflowPhase[]> = {
  proposing: ['ready', 'failed'],
  ready: ['proposing', 'implementing', 'failed'],
  implementing: ['done', 'failed'],
  done: [],
  failed: [],
};

export function isTerminalPhase(phase: WorkflowPhase): boolean {
  return phase === 'done' || phase === 'failed';
}

export function isValidTransition(from: WorkflowPhase, to: WorkflowPhase): boolean {
  return TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Workflow state
// ---------------------------------------------------------------------------

export interface Workflow {
  phase: WorkflowPhase;
  repo: RepoRef;
  issue: IssueRef;
  pullRequest: PullRequestRef;
  branch: string;
  baseBranch: string;
  changeName?: string;
  reviseRounds: number;
  lastTurnAt?: string;
  lastConsumedEventId?: string;
}

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

export const TURN_SKILLS = ['propose', 'apply'] as const;
export type TurnSkill = (typeof TURN_SKILLS)[number];

export interface TranscriptEntry {
  id: string;
  origin: 'review' | 'comment';
  author: Actor;
  body: string;
  at: string;
  reviewState?: ReviewState;
}

export interface TurnContext {
  skill: TurnSkill;
  repo: RepoRef;
  issue: IssueRef;
  pullRequest: PullRequestRef;
  branch: string;
  baseBranch: string;
  changeName?: string;
  /** Human reviews and comments the turn should read, oldest first. */
  transcript: TranscriptEntry[];
  /** Triggering events the turn should address. */
  pendingFeedback: NormalizedEvent[];
}

export interface TurnUsage {
  steps: number;
  tokens: number;
  durationMs: number;
}

export interface TurnResult {
  skill: TurnSkill;
  /** Commit SHAs produced by the turn, oldest first. */
  commits: string[];
  summary: string;
  /** Explicit questions the agent needs a human to answer. */
  questions: string[];
  /** True when the agent cannot proceed without human input. */
  needsInput: boolean;
  /** The agent's self-reported readiness. Informational only: the gate uses
   * the objective readiness predicate, never this value. */
  agentClaimsReady: boolean;
  usage?: TurnUsage;
}
