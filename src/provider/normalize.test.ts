import { describe, expect, it } from 'vitest';

import { triggersTurn, isApproval } from '../domain/types.js';
import { normalizeGithubReviewState, reviewEvent, reviewKindForState } from './normalize.js';

const ACTOR = { login: 'alice', isBot: false };

describe('normalizeGithubReviewState', () => {
  it('maps the review states the orchestrator acts on', () => {
    expect(normalizeGithubReviewState('approved')).toBe('approved');
    expect(normalizeGithubReviewState('changes_requested')).toBe('changes_requested');
    expect(normalizeGithubReviewState('commented')).toBe('commented');
  });

  it('ignores states that carry no action', () => {
    expect(normalizeGithubReviewState('dismissed')).toBeNull();
    expect(normalizeGithubReviewState('pending')).toBeNull();
  });
});

describe('reviewEvent', () => {
  it('maps changes_requested to a turn-triggering event', () => {
    const event = reviewEvent({
      id: 'r1',
      at: '2026-01-01T00:00:00.000Z',
      actor: ACTOR,
      state: 'changes_requested',
      body: 'please adjust',
    });
    expect(event.kind).toBe('changes_requested');
    expect(event.origin).toBe('review');
    expect(triggersTurn(event)).toBe(true);
    expect(isApproval(event)).toBe(false);
  });

  it('maps approved to the approval gate event', () => {
    const event = reviewEvent({
      id: 'r2',
      at: '2026-01-01T00:00:00.000Z',
      actor: ACTOR,
      state: 'approved',
    });
    expect(event.kind).toBe('approval');
    expect(isApproval(event)).toBe(true);
    expect(triggersTurn(event)).toBe(false);
  });

  it('maps a commented review to a turn-triggering conversation event', () => {
    const event = reviewEvent({
      id: 'r3',
      at: '2026-01-01T00:00:00.000Z',
      actor: ACTOR,
      state: 'commented',
      body: 'question',
    });
    expect(event.kind).toBe('conversation_comment');
    expect(event.origin).toBe('review');
    expect(triggersTurn(event)).toBe(true);
  });
});

describe('reviewKindForState', () => {
  it('derives the event kind from the review state', () => {
    expect(reviewKindForState('approved')).toBe('approval');
    expect(reviewKindForState('changes_requested')).toBe('changes_requested');
    expect(reviewKindForState('commented')).toBe('conversation_comment');
  });
});
