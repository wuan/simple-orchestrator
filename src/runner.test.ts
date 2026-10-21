import { describe, expect, it } from 'vitest';

import type { OpenCodeSkillRequest, OpenCodeSkillResult } from './runtime/opencode/client.js';
import {
  runRunner,
  type RunnerClient,
  type RunnerClientOptions,
  type RunnerEvent,
} from './runner.js';

const RESULT: OpenCodeSkillResult = {
  commits: ['c1'],
  summary: 'did the work',
  questions: [],
  needsInput: false,
  agentClaimsReady: true,
};

function request(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    skill: 'propose',
    prompt: 'do the thing',
    workspace: '/tmp/turn/worktree',
    ...overrides,
  });
}

class FakeClient implements RunnerClient {
  disposed = false;
  readonly requests: OpenCodeSkillRequest[] = [];

  constructor(
    private readonly behavior: (request: OpenCodeSkillRequest) => Promise<OpenCodeSkillResult>,
  ) {}

  runSkill(request: OpenCodeSkillRequest): Promise<OpenCodeSkillResult> {
    this.requests.push(request);
    return this.behavior(request);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }
}

interface Harness {
  events: RunnerEvent[];
  options: RunnerClientOptions[];
  client: FakeClient;
}

function harness(
  behavior: (request: OpenCodeSkillRequest) => Promise<OpenCodeSkillResult>,
): Harness {
  const events: RunnerEvent[] = [];
  const options: RunnerClientOptions[] = [];
  const client = new FakeClient(behavior);
  return { events, options, client };
}

function run(h: Harness, input: string, sdkVersion = '2.0.31'): Promise<number> {
  return runRunner(input, {
    write: (event) => h.events.push(event),
    createClient: (opts) => {
      h.options.push(opts);
      return h.client;
    },
    sdkVersion: () => sdkVersion,
  });
}

describe('runRunner', () => {
  it('runs a turn and reports ready, then the result', async () => {
    const h = harness(async () => RESULT);
    const code = await run(
      h,
      request({
        model: 'greenpt/deepseek#flash',
        agent: 'build',
        apiEndpoint: 'https://llm.example.com/v1',
        apiKeyEnv: 'LLM_API_KEY',
      }),
    );

    expect(code).toBe(0);
    expect(h.events[0]).toEqual({ type: 'ready', sdkVersion: '2.0.31' });
    expect(h.events.at(-1)).toEqual({ type: 'result', result: RESULT });
    expect(h.options[0]).toEqual({
      model: 'greenpt/deepseek#flash',
      agent: 'build',
      apiEndpoint: 'https://llm.example.com/v1',
      apiKeyEnv: 'LLM_API_KEY',
    });
    expect(h.client.requests[0]?.skill).toBe('propose');
    expect(h.client.disposed).toBe(true);
  });

  it('defaults the client options when the request omits them', async () => {
    const h = harness(async () => RESULT);
    await run(h, request());
    expect(h.options[0]).toEqual({});
  });

  it('rejects a request whose endpoint or API-key variable is not a string', async () => {
    for (const bad of [{ apiEndpoint: 5 }, { apiKeyEnv: false }]) {
      const h = harness(async () => RESULT);
      const code = await run(h, request(bad));
      expect(code).toBe(1);
      expect(h.events.at(-1)).toMatchObject({ type: 'error' });
      expect(h.options).toHaveLength(0);
    }
  });

  it('forwards usage reported before a later failure', async () => {
    const h = harness(async (r) => {
      r.onUsage?.({ model: 'greenpt/deepseek', tokens: 7 });
      throw new Error('the model errored');
    });
    const code = await run(h, request());

    expect(code).toBe(1);
    expect(h.events).toContainEqual({
      type: 'usage',
      usage: { model: 'greenpt/deepseek', tokens: 7 },
    });
    expect(h.events.at(-1)).toEqual({ type: 'error', error: 'the model errored' });
    // Usage is reported before the terminal error.
    expect(h.events.findIndex((e) => e.type === 'usage')).toBeLessThan(
      h.events.findIndex((e) => e.type === 'error'),
    );
    expect(h.client.disposed).toBe(true);
  });

  it('maps a malformed request to an error without creating a client', async () => {
    const h = harness(async () => RESULT);
    const code = await run(h, 'not json');

    expect(code).toBe(1);
    expect(h.events[0]).toMatchObject({ type: 'error' });
    expect(h.options).toHaveLength(0);
  });

  it('rejects a request with an invalid skill', async () => {
    const h = harness(async () => RESULT);
    const code = await run(h, request({ skill: 'archive' }));

    expect(code).toBe(1);
    expect(h.events.at(-1)).toMatchObject({ type: 'error' });
    expect(h.options).toHaveLength(0);
  });

  it('fails fast when the image SDK version differs from the expected one', async () => {
    const h = harness(async () => RESULT);
    const code = await run(h, request({ expectedSdkVersion: '1.0.0' }), '2.0.31');

    expect(code).toBe(1);
    expect(h.events.at(-1)).toMatchObject({ type: 'error' });
    expect((h.events.at(-1) as { error: string }).error).toContain('does not match');
    expect(h.options).toHaveLength(0);
  });

  it('reports a terminal error when the SDK cannot be resolved', async () => {
    const events: RunnerEvent[] = [];
    const code = await runRunner(request(), {
      write: (event) => events.push(event),
      createClient: () => {
        throw new Error('should not be called');
      },
      sdkVersion: () => {
        throw new Error('missing');
      },
    });

    expect(code).toBe(1);
    expect(events.at(-1)).toMatchObject({ type: 'error' });
  });
});
