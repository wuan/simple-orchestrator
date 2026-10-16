import { homedir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandHome } from './paths.js';

describe('expandHome', () => {
  it('expands a leading tilde to the home directory', () => {
    expect(expandHome('~/workspace')).toBe(join(homedir(), 'workspace'));
  });

  it('expands a bare tilde', () => {
    expect(expandHome('~')).toBe(homedir());
  });

  it('leaves absolute and relative paths unchanged', () => {
    expect(expandHome('/tmp/work')).toBe('/tmp/work');
    expect(expandHome('relative/work')).toBe('relative/work');
  });

  it('does not treat a mid-path tilde as home', () => {
    expect(expandHome('/tmp/~backup')).toBe('/tmp/~backup');
  });
});
