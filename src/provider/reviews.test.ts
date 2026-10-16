import { describe, expect, it } from 'vitest';

import { isBotActor, latestHumanReview } from './reviews.js';
import type { ProviderReview } from './types.js';

function review(overrides: Partial<ProviderReview>): ProviderReview {
  return {
    id: '1',
    author: { login: 'alice', isBot: false },
    state: 'commented',
    body: '',
    at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isBotActor', () => {
  it('detects bots by flag or login suffix', () => {
    expect(isBotActor({ login: 'dependabot', isBot: true })).toBe(true);
    expect(isBotActor({ login: 'github-actions[bot]', isBot: false })).toBe(true);
    expect(isBotActor({ login: 'alice', isBot: false })).toBe(false);
  });
});

describe('latestHumanReview', () => {
  it('returns the newest human review and excludes bots', () => {
    const reviews = [
      review({ id: 'r1', at: '2026-01-01T00:00:00.000Z', state: 'changes_requested' }),
      review({
        id: 'bot',
        author: { login: 'openspec-bot', isBot: true },
        at: '2026-01-02T00:00:00.000Z',
      }),
      review({ id: 'r2', at: '2026-01-03T00:00:00.000Z', state: 'approved' }),
    ];
    expect(latestHumanReview(reviews, 'openspec-bot')?.id).toBe('r2');
  });

  it('excludes a configured bot login even when isBot is false', () => {
    const reviews = [
      review({
        id: 'bot',
        author: { login: 'openspec-bot', isBot: false },
        at: '2026-01-05T00:00:00.000Z',
      }),
    ];
    expect(latestHumanReview(reviews, 'openspec-bot')).toBeNull();
  });

  it('returns null when there are no human reviews', () => {
    expect(latestHumanReview([], 'openspec-bot')).toBeNull();
  });
});
