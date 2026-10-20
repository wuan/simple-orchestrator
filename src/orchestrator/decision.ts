import { triggersTurn, type NormalizedEvent, type WorkflowPhase } from '../domain/types.js';

export interface DecisionInput {
  triggerLabelPresent: boolean;
  pullRequestState: 'open' | 'closed' | 'merged';
  phase: WorkflowPhase;
  latestHumanReview: NormalizedEvent | null;
  /** When the orchestrator last acted on this workflow (its last bot comment). */
  lastTurnAt: string | null;
  reviseRounds: number;
  maxReviseRounds: number;
}

export type WorkflowAction =
  | { kind: 'idle'; reason: string }
  | { kind: 'revise'; trigger: NormalizedEvent; reason: string }
  | { kind: 'apply'; trigger: NormalizedEvent }
  | { kind: 'finish' }
  | { kind: 'cancel'; reason: string }
  | { kind: 'fail'; reason: string };

function isNewer(at: string, than: string | null): boolean {
  return than === null || Date.parse(at) > Date.parse(than);
}

/**
 * A terminal decision taken from state alone, before any review is considered;
 * `null` when the workflow is still open to review-driven action.
 */
function terminalAction(input: DecisionInput): WorkflowAction | null {
  if (input.pullRequestState === 'merged') return { kind: 'finish' };
  if (input.pullRequestState === 'closed') {
    return { kind: 'cancel', reason: 'pull request closed without merge' };
  }
  if (!input.triggerLabelPresent) {
    return { kind: 'cancel', reason: 'trigger label removed from the issue' };
  }
  if (input.phase === 'done') return { kind: 'idle', reason: 'workflow already complete' };
  if (input.phase === 'failed') return { kind: 'idle', reason: 'workflow already failed' };
  if (input.phase === 'implementing') {
    return { kind: 'idle', reason: 'implementation in progress; awaiting merge' };
  }
  return null;
}

/**
 * The action for a latest approval: apply once the change is ready, otherwise
 * ask for a revise until the limit, and stay idle when the approval is stale.
 */
function approvalAction(
  input: DecisionInput,
  review: NormalizedEvent,
  fresh: boolean,
): WorkflowAction {
  // An answered approval never opens the gate: one given before the change was
  // ready approved a different proposal than the one that is now READY.
  if (!fresh) {
    return input.phase === 'ready'
      ? { kind: 'idle', reason: 'approval predates the ready change; awaiting a new approval' }
      : { kind: 'idle', reason: 'approved but not ready' };
  }
  if (input.phase === 'ready') return { kind: 'apply', trigger: review };
  if (input.reviseRounds >= input.maxReviseRounds) {
    return { kind: 'fail', reason: 'revise limit reached before the change was ready' };
  }
  return {
    kind: 'revise',
    trigger: review,
    reason: 'approval arrived before the change was ready',
  };
}

/** The action for a newer review that asks for changes. */
function feedbackAction(input: DecisionInput, review: NormalizedEvent): WorkflowAction {
  if (input.reviseRounds >= input.maxReviseRounds) {
    return { kind: 'fail', reason: 'revise limit reached' };
  }
  return { kind: 'revise', trigger: review, reason: 'new reviewer feedback' };
}

/**
 * The watermark decision function. Given only labels and timestamps, it decides
 * what (if anything) to do for one workflow. It is pure, so it is safe to call
 * on every poll and after any restart.
 */
export function decide(input: DecisionInput): WorkflowAction {
  const terminal = terminalAction(input);
  if (terminal !== null) return terminal;

  const review = input.latestHumanReview;
  if (review === null) return { kind: 'idle', reason: 'no new human activity' };
  const fresh = isNewer(review.at, input.lastTurnAt);

  if (review.kind === 'approval') return approvalAction(input, review, fresh);
  if (fresh && triggersTurn(review)) return feedbackAction(input, review);
  return { kind: 'idle', reason: 'no new human activity' };
}
