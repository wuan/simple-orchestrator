import { describe, expect, it } from 'vitest';

import { VERSION } from './version.js';

describe('package scaffold', () => {
  it('exports a version string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
