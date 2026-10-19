import { describe, expect, it } from 'vitest';

import {
  COMMIT_SUBJECT_LIMIT,
  conventionalTitle,
  parseConventionalSubject,
  rebuildConventionalSubject,
  reconcileConventionalTitle,
} from './title.js';

function ellipsisCount(subject: string): number {
  return subject.split('…').length - 1;
}

describe('conventionalTitle', () => {
  it('deduces the type from a matching label', () => {
    expect(conventionalTitle({ title: 'Handle a crash', labels: ['bug'] })).toBe(
      'fix: Handle a crash',
    );
  });

  it('matches labels case-insensitively', () => {
    expect(conventionalTitle({ title: 'Handle a crash', labels: ['Bug'] })).toBe(
      'fix: Handle a crash',
    );
  });

  it('maps the documented labels to their types', () => {
    expect(conventionalTitle({ title: 'x', labels: ['documentation'] })).toBe('docs: x');
    expect(conventionalTitle({ title: 'x', labels: ['enhancement'] })).toBe('feat: x');
    expect(conventionalTitle({ title: 'x', labels: ['refactor'] })).toBe('refactor: x');
    expect(conventionalTitle({ title: 'x', labels: ['performance'] })).toBe('perf: x');
    expect(conventionalTitle({ title: 'x', labels: ['tests'] })).toBe('test: x');
    expect(conventionalTitle({ title: 'x', labels: ['ci'] })).toBe('ci: x');
    expect(conventionalTitle({ title: 'x', labels: ['dependencies'] })).toBe('build: x');
    expect(conventionalTitle({ title: 'x', labels: ['maintenance'] })).toBe('chore: x');
  });

  it('defaults the type to feat when neither the title nor the labels name one', () => {
    expect(conventionalTitle({ title: 'Add a thing', labels: ['triage'] })).toBe(
      'feat: Add a thing',
    );
  });

  it('preserves an already-conventional issue title, including its scope', () => {
    expect(conventionalTitle({ title: 'docs(api): update the reference', labels: ['bug'] })).toBe(
      'docs(api): update the reference',
    );
  });

  it('does not keep a prefix whose type is not a project type', () => {
    expect(conventionalTitle({ title: 'widget: do a thing', labels: ['bug'] })).toBe(
      'fix: widget: do a thing',
    );
  });

  it('drops a trailing period and collapses whitespace in the summary', () => {
    expect(conventionalTitle({ title: '  Add   a thing.  ', labels: [] })).toBe(
      'feat: Add a thing',
    );
  });

  it('shortens a long summary at a word boundary within the subject limit', () => {
    const title = conventionalTitle({
      title:
        'Allow to extract default values from the configuration to avoid repeating information',
      labels: [],
    });
    expect(title).toBe('feat: Allow to extract default values from the configuration to avoid…');
    expect(title.length).toBeLessThan(COMMIT_SUBJECT_LIMIT);
  });

  it('replaces a stale ellipsis rather than stacking a second one', () => {
    const once = conventionalTitle({
      title:
        'Allow to extract default values from the configuration to avoid repeating information',
      labels: [],
    });
    const twice = conventionalTitle({
      title: `${once}…`,
      labels: [],
    });
    expect(twice).toBe(once);
    expect(ellipsisCount(twice)).toBe(1);
  });
});

describe('rebuildConventionalSubject', () => {
  it('replaces the type while keeping the summary', () => {
    expect(rebuildConventionalSubject('fix(api): handle timeout', 'feat')).toBe(
      'feat: handle timeout',
    );
  });

  it('adds a scope', () => {
    expect(rebuildConventionalSubject('fix: handle timeout', 'fix', 'api')).toBe(
      'fix(api): handle timeout',
    );
  });

  it('replaces a scope', () => {
    expect(rebuildConventionalSubject('fix(old): handle timeout', 'fix', 'api')).toBe(
      'fix(api): handle timeout',
    );
  });

  it('re-shortens the summary within the limit without stacking ellipses', () => {
    const current = 'feat: Allow to extract default values from the configuration to avoid…';
    const rebuilt = rebuildConventionalSubject(current, 'fix', 'rollout');
    expect(rebuilt).toBe('fix(rollout): Allow to extract default values from the configuration…');
    expect(rebuilt.length).toBeLessThan(COMMIT_SUBJECT_LIMIT);
    expect(ellipsisCount(rebuilt)).toBe(1);
  });

  it('returns a non-conventional subject unchanged', () => {
    expect(rebuildConventionalSubject('do a thing', 'feat')).toBe('do a thing');
  });

  it('returns a subject with a non-project-type prefix unchanged', () => {
    expect(rebuildConventionalSubject('widget: do a thing', 'feat')).toBe('widget: do a thing');
  });
});

describe('parseConventionalSubject', () => {
  it('reads the type, scope, and summary of a recognized subject', () => {
    expect(parseConventionalSubject('feat(api): add pagination')).toEqual({
      type: 'feat',
      scope: 'api',
      summary: 'add pagination',
    });
  });

  it('returns null for an unrecognized type', () => {
    expect(parseConventionalSubject('widget: do a thing')).toBeNull();
  });
});

describe('reconcileConventionalTitle', () => {
  it('adopts an agreed applied type and scope', () => {
    const subjects = ['feat(api): add pagination', 'feat(api): cover the edge case'];
    expect(reconcileConventionalTitle('feat: add pagination', subjects)).toBe(
      'feat(api): add pagination',
    );
  });

  it('keeps the deduced scope when the applied subjects disagree on one', () => {
    const subjects = ['feat(api): add pagination', 'feat(web): cover the edge case'];
    expect(reconcileConventionalTitle('feat(api): add pagination', subjects)).toBe(
      'feat(api): add pagination',
    );
  });

  it('ignores OpenSpec bookkeeping subjects', () => {
    const subjects = ['feat: add pagination', 'chore(openspec): archive the change'];
    expect(reconcileConventionalTitle('fix: add pagination', subjects)).toBe(
      'feat: add pagination',
    );
  });

  it('leaves the title unchanged when the subjects disagree on a type', () => {
    const subjects = ['feat: add pagination', 'fix: correct a typo'];
    expect(reconcileConventionalTitle('feat: add pagination', subjects)).toBe(
      'feat: add pagination',
    );
  });

  it('leaves the title unchanged when a subject is not recognized', () => {
    expect(reconcileConventionalTitle('feat: add pagination', ['widget: do a thing'])).toBe(
      'feat: add pagination',
    );
  });
});
