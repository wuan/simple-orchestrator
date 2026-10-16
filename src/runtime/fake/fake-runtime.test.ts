import { describe, expect, it } from 'vitest';

import { DEFAULT_LIMITS } from '../../config/types.js';
import type { TurnRequest } from '../types.js';
import { FakeRuntime } from './fake-runtime.js';

const REPO = { owner: 'acme', name: 'widget' };
const REQUEST: TurnRequest = {
  context: {
    skill: 'propose',
    repo: REPO,
    issue: { repo: REPO, number: 1 },
    pullRequest: { repo: REPO, number: 10 },
    branch: 'openspec/issue-1',
    baseBranch: 'main',
    transcript: [],
    pendingFeedback: [],
  },
  workspace: '/tmp/workspace',
  limits: DEFAULT_LIMITS,
};

describe('FakeRuntime', () => {
  it('records requests and returns queued results', async () => {
    const runtime = new FakeRuntime();
    runtime.enqueue({
      skill: 'propose',
      commits: ['c1'],
      summary: 'done',
      questions: [],
      needsInput: false,
      agentClaimsReady: false,
    });
    const result = await runtime.run(REQUEST);
    expect(result.commits).toEqual(['c1']);
    expect(runtime.requests).toHaveLength(1);
  });

  it('can derive a result from the request', async () => {
    const runtime = new FakeRuntime((request) => ({
      skill: request.context.skill,
      commits: [],
      summary: request.context.branch,
      questions: [],
      needsInput: false,
      agentClaimsReady: false,
    }));
    expect((await runtime.run(REQUEST)).summary).toBe('openspec/issue-1');
  });

  it('fails when no result is available', async () => {
    await expect(new FakeRuntime().run(REQUEST)).rejects.toThrowError(/no result queued/);
  });
});
