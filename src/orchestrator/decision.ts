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
 * The watermark decision function. Given only labels and timestamps, it decides
 * what (if anything) to do for one workflow. It is pure, so it is safe to call
 * on every poll and after any restart.
 */
export function decide(input: DecisionInput): WorkflowAction {
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

  const review = input.latestHumanReview;
  const fresh = review !== null && isNewer(review.at, input.lastTurnAt);

  if (review !== null && review.kind === 'approval') {
    if (input.phase === 'ready') return { kind: 'apply', trigger: review };
    if (fresh) {
      if (input.reviseRounds >= input.maxReviseRounds) {
        return { kind: 'fail', reason: 'revise limit reached before the change was ready' };
      }
      return {
        kind: 'revise',
        trigger: review,
        reason: 'approval arrived before the change was ready',
      };
    }
    return { kind: 'idle', reason: 'approved but not ready' };
  }

  if (review !== null && fresh && triggersTurn(review)) {
    if (input.reviseRounds >= input.maxReviseRounds) {
      return { kind: 'fail', reason: 'revise limit reached' };
    }
    return { kind: 'revise', trigger: review, reason: 'new reviewer feedback' };
  }

  return { kind: 'idle', reason: 'no new human activity' };
}
