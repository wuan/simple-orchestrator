import { describe, expect, it } from 'vitest';

import { assertMergeAllowedBy, assertPushAllowed, PermissionError } from './policy.js';

describe('assertPushAllowed', () => {
  it('allows pushing to the workflow branch', () => {
    expect(() =>
      assertPushAllowed({ branch: 'openspec/issue-1', protectedBranches: ['main'] }),
    ).not.toThrow();
  });

  it('rejects pushing to a protected branch', () => {
    expect(() =>
      assertPushAllowed({ branch: 'main', protectedBranches: ['main'] }),
    ).toThrowError(PermissionError);
  });

  it('rejects force-push', () => {
    expect(() =>
      assertPushAllowed({ branch: 'openspec/issue-1', protectedBranches: ['main'], force: true }),
    ).toThrowError(/force-push/);
  });
});

describe('assertMergeAllowedBy', () => {
  it('reserves merges for humans', () => {
    expect(() => assertMergeAllowedBy('human')).not.toThrow();
    expect(() => assertMergeAllowedBy('agent')).toThrowError(/reserved for humans/);
  });
});
