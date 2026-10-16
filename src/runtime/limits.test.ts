import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_LIMITS } from '../config/types.js';
import type { TurnContext } from '../domain/types.js';
import { FakeRuntime } from './fake/fake-runtime.js';
import { LimitedRuntime, LimitExceededError } from './limits.js';
import type { AgentRuntime, TurnRequest } from './types.js';

const REPO = { owner: 'acme', name: 'widget' };
const CONTEXT: TurnContext = {
  skill: 'propose',
  repo: REPO,
  issue: { repo: REPO, number: 1 },
  pullRequest: { repo: REPO, number: 10 },
  branch: 'openspec/issue-1',
  baseBranch: 'main',
  transcript: [],
  pendingFeedback: [],
};

function request(limits: Partial<TurnRequest['limits']> = {}): TurnRequest {
  return { context: CONTEXT, workspace: '/tmp/workspace', limits: { ...DEFAULT_LIMITS, ...limits } };
}

function usageRuntime(steps: number, tokens: number): AgentRuntime {
  return new FakeRuntime(() => ({
    skill: 'propose',
    commits: [],
    summary: '',
    questions: [],
    needsInput: false,
    agentClaimsReady: false,
    usage: { steps, tokens, durationMs: 0 },
  }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('LimitedRuntime', () => {
  it('passes a turn that stays within its limits', async () => {
    const limited = new LimitedRuntime(usageRuntime(1, 0));
    await expect(limited.run(request())).resolves.toMatchObject({ skill: 'propose' });
  });

  it('fails when the step limit is exceeded', async () => {
    const limited = new LimitedRuntime(usageRuntime(10, 0));
    await expect(limited.run(request({ maxSteps: 5 }))).rejects.toBeInstanceOf(LimitExceededError);
  });

  it('fails when the token limit is exceeded', async () => {
    const limited = new LimitedRuntime(usageRuntime(1, 1000));
    await expect(limited.run(request({ maxTokens: 100 }))).rejects.toMatchObject({ limit: 'tokens' });
  });

  it('fails when the wall-clock limit is exceeded', async () => {
    vi.useFakeTimers();
    const hanging: AgentRuntime = {
      id: 'hang',
      run: (req) =>
        new Promise<TurnResultLike>((_resolve, reject) => {
          req.signal?.addEventListener('abort', () => reject(req.signal?.reason));
        }),
    };
    const limited = new LimitedRuntime(hanging);
    const promise = limited.run(request({ maxDurationMs: 1000 }));
    // Attach the rejection handler before advancing so the rejection is never
    // momentarily unhandled.
    const assertion = expect(promise).rejects.toMatchObject({ limit: 'duration' });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });
});

type TurnResultLike = Awaited<ReturnType<AgentRuntime['run']>>;
