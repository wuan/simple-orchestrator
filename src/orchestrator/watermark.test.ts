import { describe, expect, it } from 'vitest';

import { answeredMarker, answeredWatermark, parseAnsweredMarker } from './watermark.js';

describe('answered marker', () => {
  it('round-trips a review timestamp', () => {
    const body = `**OpenSpec propose turn**\n${answeredMarker('2026-01-01T00:00:05.000Z')}`;
    expect(parseAnsweredMarker(body)).toBe('2026-01-01T00:00:05.000Z');
  });

  it('records that no review was read', () => {
    expect(parseAnsweredMarker(answeredMarker(null))).toBeNull();
  });

  it('is absent from a comment without a marker or with an invalid one', () => {
    expect(parseAnsweredMarker('**OpenSpec propose turn**')).toBeUndefined();
    expect(parseAnsweredMarker('<!-- openspec-answered: soon -->')).toBeUndefined();
  });
});

describe('answeredWatermark', () => {
  it('is the newest recorded review, not the time of the comment', () => {
    const watermark = answeredWatermark([
      { body: answeredMarker('2026-01-01T00:00:01.000Z'), at: '2026-01-01T00:01:00.000Z' },
      { body: answeredMarker('2026-01-01T00:00:05.000Z'), at: '2026-01-01T00:02:00.000Z' },
      { body: answeredMarker('2026-01-01T00:00:03.000Z'), at: '2026-01-01T00:03:00.000Z' },
    ]);
    expect(watermark).toBe('2026-01-01T00:00:05.000Z');
  });

  it('ignores comments that record no review', () => {
    expect(
      answeredWatermark([{ body: answeredMarker(null), at: '2026-01-01T00:01:00.000Z' }]),
    ).toBe(null);
  });

  it('dates a comment without a marker by its own timestamp', () => {
    const watermark = answeredWatermark([
      { body: 'posted before markers', at: '2026-01-01T00:01:00.000Z' },
      { body: answeredMarker('2026-01-01T00:00:05.000Z'), at: '2026-01-01T00:02:00.000Z' },
    ]);
    expect(watermark).toBe('2026-01-01T00:01:00.000Z');
  });

  it('is null without comments', () => {
    expect(answeredWatermark([])).toBeNull();
  });
});
