import { describe, expect, it } from 'vitest';

import type { TurnUsage } from '../domain/types.js';
import {
  accumulateUsage,
  formatDuration,
  latestUsage,
  mergeUsage,
  parseUsageMarker,
  usageLine,
  usageMarker,
  withLastTurnMetrics,
  withTurnMetrics,
} from './usage.js';

const USAGE: TurnUsage = {
  model: 'greenpt/deepseek-v4.1-flash',
  input: 1000,
  output: 200,
  reasoning: 20,
  cacheRead: 10,
  cacheWrite: 4,
  tokens: 1234,
  durationMs: 1234,
  attempts: 2,
};

describe('formatDuration', () => {
  it('renders milliseconds under a second and seconds above', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(250)).toBe('250ms');
    expect(formatDuration(1234)).toBe('1.2s');
    expect(formatDuration(60000)).toBe('60s');
  });
});

describe('usageLine', () => {
  it('renders the model, per-kind tokens and total, elapsed, and attempts', () => {
    expect(usageLine(USAGE)).toBe(
      '**Usage:** model `greenpt/deepseek-v4.1-flash` · tokens 1234 ' +
        '(input 1000 · output 200 · reasoning 20 · cache read 10 · cache write 4) · ' +
        'elapsed 1.2s · attempts 2',
    );
  });

  it('labels the last turn and states unknown values explicitly', () => {
    expect(usageLine(undefined, true)).toBe(
      '**Usage (last turn):** model unknown · tokens unknown · elapsed unknown · attempts unknown',
    );
    expect(usageLine({ durationMs: 5, attempts: 1 })).toBe(
      '**Usage:** model unknown · tokens unknown · elapsed 5ms · attempts 1',
    );
  });

  it('reports a known total without a breakdown when no bucket is reported', () => {
    expect(usageLine({ model: 'm', tokens: 7, durationMs: 1, attempts: 1 })).toBe(
      '**Usage:** model `m` · tokens 7 · elapsed 1ms · attempts 1',
    );
  });
});

describe('usage marker', () => {
  it('round-trips usage through the invisible marker', () => {
    const body = withTurnMetrics('turn summary', USAGE);
    expect(body).toContain('turn summary');
    expect(body).toContain('<!-- openspec-usage: ');
    expect(parseUsageMarker(body)).toEqual(USAGE);
  });

  it('returns undefined when there is no marker', () => {
    expect(parseUsageMarker('just a comment')).toBeUndefined();
    expect(parseUsageMarker('<!-- openspec-usage: not json -->')).toBeUndefined();
  });

  it('recovers the newest marker by timestamp, not list order', () => {
    const older = `seen\n${usageMarker({ model: 'a', tokens: 1 })}`;
    const newer = `seen\n${usageMarker({ model: 'b', tokens: 2 })}`;
    expect(
      latestUsage([
        { body: newer, at: '2026-01-01T00:00:02.000Z' },
        { body: older, at: '2026-01-01T00:00:01.000Z' },
      ])?.model,
    ).toBe('b');
    expect(latestUsage([{ body: 'no marker', at: '2026-01-01T00:00:03.000Z' }])).toBeUndefined();
  });

  it('appends an unknown last-turn line to a lifecycle comment', () => {
    expect(withLastTurnMetrics('Merged.', undefined)).toBe(
      'Merged.\n\n**Usage (last turn):** model unknown · tokens unknown · elapsed unknown · attempts unknown',
    );
  });
});

describe('usage accumulation', () => {
  it('sums streamed usage across attempts', () => {
    const accumulated: TurnUsage = {};
    accumulateUsage(accumulated, { steps: 1, tokens: 10, input: 10 });
    accumulateUsage(accumulated, { steps: 1, tokens: 5, input: 5, model: 'first' });
    expect(accumulated).toEqual({ steps: 2, tokens: 15, input: 15, model: 'first' });
  });

  it('fills from the returned usage only where the stream is unknown', () => {
    const merged = mergeUsage(
      { steps: 2, tokens: 15, input: 15 },
      { model: 'final', tokens: 20, input: 20, output: 5 },
    );
    expect(merged).toEqual({ steps: 2, tokens: 15, input: 15, output: 5, model: 'final' });
  });

  it('keeps the streamed usage when the runtime returned none', () => {
    expect(mergeUsage({ tokens: 3 }, undefined)).toEqual({ tokens: 3 });
  });
});
