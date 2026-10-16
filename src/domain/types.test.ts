import { describe, expect, it } from 'vitest';

import {
  isApproval,
  isNormalizedEventKind,
  isReviewState,
  isTerminalPhase,
  isValidTransition,
  isWorkflowPhase,
  triggersTurn,
  type NormalizedEvent,
} from './types.js';

function event(overrides: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    kind: 'conversation_comment',
    origin: 'comment',
    id: 'evt-1',
    at: '2026-01-01T00:00:00.000Z',
    actor: { login: 'alice', isBot: false },
    ...overrides,
  };
}

describe('workflow phase validity', () => {
  it('recognizes known phases and rejects unknown ones', () => {
    expect(isWorkflowPhase('proposing')).toBe(true);
    expect(isWorkflowPhase('implementing')).toBe(true);
    expect(isWorkflowPhase('cancelled')).toBe(false);
    expect(isWorkflowPhase(42)).toBe(false);
  });

  it('marks done and failed as terminal', () => {
    expect(isTerminalPhase('done')).toBe(true);
    expect(isTerminalPhase('failed')).toBe(true);
    expect(isTerminalPhase('ready')).toBe(false);
  });

  it('allows the intended transitions only', () => {
    expect(isValidTransition('proposing', 'ready')).toBe(true);
    expect(isValidTransition('ready', 'implementing')).toBe(true);
    expect(isValidTransition('ready', 'proposing')).toBe(true);
    expect(isValidTransition('implementing', 'done')).toBe(true);
    expect(isValidTransition('proposing', 'implementing')).toBe(false);
    expect(isValidTransition('implementing', 'ready')).toBe(false);
    expect(isValidTransition('done', 'ready')).toBe(false);
    expect(isValidTransition('failed', 'proposing')).toBe(false);
  });
});

describe('normalized event validity', () => {
  it('recognizes the common event set', () => {
    expect(isNormalizedEventKind('workflow_start')).toBe(true);
    expect(isNormalizedEventKind('approval')).toBe(true);
    expect(isNormalizedEventKind('reviewed')).toBe(false);
  });

  it('recognizes review states', () => {
    expect(isReviewState('changes_requested')).toBe(true);
    expect(isReviewState('approved')).toBe(true);
    expect(isReviewState('pending')).toBe(false);
  });

  it('triggers a turn for change requests and submitted reviews', () => {
    expect(triggersTurn(event({ kind: 'changes_requested', origin: 'review' }))).toBe(true);
    expect(triggersTurn(event({ kind: 'conversation_comment', origin: 'review' }))).toBe(true);
  });

  it('does not trigger for plain comments, approvals, or cancellations', () => {
    expect(triggersTurn(event({ kind: 'conversation_comment', origin: 'comment' }))).toBe(false);
    expect(triggersTurn(event({ kind: 'approval', origin: 'review' }))).toBe(false);
    expect(triggersTurn(event({ kind: 'cancellation', origin: 'label' }))).toBe(false);
  });

  it('identifies approvals', () => {
    expect(isApproval(event({ kind: 'approval' }))).toBe(true);
    expect(isApproval(event({ kind: 'changes_requested' }))).toBe(false);
  });
});
