import { describe, expect, it } from 'vitest';

import {
  RateLimitError,
  RateLimitTracker,
  resetTimeFromHeaders,
  shouldBackOff,
} from './ratelimit.js';

function futureEpochSeconds(offsetMs = 3_600_000): string {
  return String(Math.floor((Date.now() + offsetMs) / 1000));
}

describe('shouldBackOff', () => {
  it('is true only when remaining is below the floor', () => {
    expect(shouldBackOff({ 'x-ratelimit-remaining': '10' }, 50)).toBe(true);
    expect(shouldBackOff({ 'x-ratelimit-remaining': '100' }, 50)).toBe(false);
    expect(shouldBackOff({}, 50)).toBe(false);
  });
});

describe('resetTimeFromHeaders', () => {
  it('parses the reset epoch into a Date', () => {
    expect(resetTimeFromHeaders({ 'x-ratelimit-reset': '1700000000' })?.getTime()).toBe(
      1_700_000_000_000,
    );
    expect(resetTimeFromHeaders({})).toBeNull();
  });
});

describe('RateLimitTracker', () => {
  it('backs off until the reset time once the quota is low', () => {
    const tracker = new RateLimitTracker(50);
    tracker.observe({ 'x-ratelimit-remaining': '5', 'x-ratelimit-reset': futureEpochSeconds() });
    expect(tracker.isBackingOff()).toBe(true);
    expect(() => tracker.assertAllowed()).toThrowError(RateLimitError);
  });

  it('does not back off when the quota is healthy', () => {
    const tracker = new RateLimitTracker(50);
    tracker.observe({ 'x-ratelimit-remaining': '4999' });
    expect(tracker.isBackingOff()).toBe(false);
    expect(() => tracker.assertAllowed()).not.toThrow();
  });

  it('expires once the reset time has passed', () => {
    const tracker = new RateLimitTracker(50);
    tracker.observe({
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) - 10),
    });
    expect(tracker.isBackingOff()).toBe(false);
  });
});
