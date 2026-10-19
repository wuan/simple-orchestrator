import { describe, expect, it } from 'vitest';

import { reviewEvent } from '../provider/normalize.js';
import { decide, type DecisionInput } from './decision.js';

const HUMAN = { login: 'alice', isBot: false };

const APPROVAL = reviewEvent({
  id: 'r1',
  at: '2026-02-01T00:00:00.000Z',
  actor: HUMAN,
  state: 'approved',
});
const CHANGE_REQUEST = reviewEvent({
  id: 'r2',
  at: '2026-02-02T00:00:00.000Z',
  actor: HUMAN,
  state: 'changes_requested',
});

function input(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    triggerLabelPresent: true,
    pullRequestState: 'open',
    phase: 'proposing',
    latestHumanReview: null,
    lastTurnAt: null,
    reviseRounds: 0,
    maxReviseRounds: 3,
    ...overrides,
  };
}

describe('decide', () => {
  it('finishes a merged pull request', () => {
    expect(decide(input({ pullRequestState: 'merged' })).kind).toBe('finish');
  });

  it('cancels a closed pull request', () => {
    expect(decide(input({ pullRequestState: 'closed' })).kind).toBe('cancel');
  });

  it('cancels when the trigger label is removed', () => {
    expect(decide(input({ triggerLabelPresent: false })).kind).toBe('cancel');
  });

  it('does nothing when there is no new human activity', () => {
    expect(
      decide(input({ latestHumanReview: CHANGE_REQUEST, lastTurnAt: '2026-02-03T00:00:00.000Z' }))
        .kind,
    ).toBe('idle');
  });

  it('revises for new reviewer feedback', () => {
    const action = decide(input({ latestHumanReview: CHANGE_REQUEST }));
    expect(action.kind).toBe('revise');
  });

  it('fails when the revise limit is reached', () => {
    const action = decide(
      input({ latestHumanReview: CHANGE_REQUEST, reviseRounds: 3, maxReviseRounds: 3 }),
    );
    expect(action.kind).toBe('fail');
  });

  it('applies an approved ready change', () => {
    const action = decide(input({ phase: 'ready', latestHumanReview: APPROVAL }));
    expect(action.kind).toBe('apply');
  });

  it('is idle in READY for an approval it has already answered', () => {
    const action = decide(
      input({
        phase: 'ready',
        latestHumanReview: APPROVAL,
        lastTurnAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    expect(action.kind).toBe('idle');
  });

  it('applies an approval newer than the last answered review', () => {
    const action = decide(
      input({
        phase: 'ready',
        latestHumanReview: APPROVAL,
        lastTurnAt: '2026-01-31T00:00:00.000Z',
      }),
    );
    expect(action.kind).toBe('apply');
  });

  it('honors the implementing claim: approval while implementing is idle', () => {
    const action = decide(input({ phase: 'implementing', latestHumanReview: APPROVAL }));
    expect(action.kind).toBe('idle');
  });

  it('drives readiness when approval arrives before the change is ready', () => {
    const action = decide(input({ phase: 'proposing', latestHumanReview: APPROVAL }));
    expect(action.kind).toBe('revise');
  });

  it('is idle for terminal phases', () => {
    expect(decide(input({ phase: 'done' })).kind).toBe('idle');
    expect(decide(input({ phase: 'failed' })).kind).toBe('idle');
  });
});
