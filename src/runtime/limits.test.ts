import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_LIMITS } from '../config/types.js';
import type { TurnContext } from '../domain/types.js';
import { FakeRuntime } from './fake/fake-runtime.js';
import { countedTokens, LimitedRuntime, LimitExceededError } from './limits.js';
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
  return {
    context: CONTEXT,
    workspace: '/tmp/workspace',
    limits: { ...DEFAULT_LIMITS, ...limits },
  };
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
    await expect(limited.run(request({ maxTokens: 100 }))).rejects.toMatchObject({
      limit: 'tokens',
    });
  });

  it('does not count cache reads against the token budget', async () => {
    const runtime = new FakeRuntime(() => ({
      skill: 'propose',
      commits: [],
      summary: '',
      questions: [],
      needsInput: false,
      agentClaimsReady: false,
      usage: {
        input: 1000,
        output: 500,
        reasoning: 200,
        cacheRead: 5_000_000,
        cacheWrite: 0,
        tokens: 5_001_700,
        steps: 1,
        durationMs: 0,
      },
    }));

    await expect(
      new LimitedRuntime(runtime).run(request({ maxTokens: 2000 })),
    ).resolves.toMatchObject({ skill: 'propose' });
  });

  it('counts new work against the token budget', async () => {
    const runtime = new FakeRuntime(() => ({
      skill: 'propose',
      commits: [],
      summary: '',
      questions: [],
      needsInput: false,
      agentClaimsReady: false,
      usage: { input: 1000, output: 500, reasoning: 600, cacheWrite: 0, tokens: 2100, steps: 1 },
    }));

    await expect(
      new LimitedRuntime(runtime).run(request({ maxTokens: 2000 })),
    ).rejects.toMatchObject({ limit: 'tokens' });
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

describe('countedTokens', () => {
  it('counts input, output, reasoning, and cache write', () => {
    expect(
      countedTokens({
        input: 1,
        output: 2,
        reasoning: 3,
        cacheWrite: 4,
        cacheRead: 100,
        tokens: 110,
      }),
    ).toBe(10);
  });

  it('falls back to the reported total when no per-kind counts are present', () => {
    expect(countedTokens({ tokens: 42 })).toBe(42);
  });

  it('reports nothing when the runtime reports nothing', () => {
    expect(countedTokens({})).toBeUndefined();
  });
});

type TurnResultLike = Awaited<ReturnType<AgentRuntime['run']>>;
