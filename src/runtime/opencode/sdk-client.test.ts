import { describe, expect, it } from 'vitest';

import type { TurnUsage } from '../../domain/types.js';
import type { OpenCodeSkillRequest } from './client.js';
import {
  EmbeddedOpenCodeClient,
  type OpenCodeHost,
  type OpenCodePromptResult,
  type SessionModel,
} from './sdk-client.js';

class FakeHost implements OpenCodeHost {
  readonly sessions: {
    directory: string;
    title: string;
    model?: SessionModel;
    agent?: string;
  }[] = [];
  readonly prompts: { sessionID: string; text: string; signal?: AbortSignal }[] = [];
  closed = 0;

  constructor(
    private readonly replies: Array<string | OpenCodePromptResult> = ['done'],
    private readonly onRun?: (prompt: { sessionID: string; text: string }) => void,
  ) {}

  async createSession(input: {
    directory: string;
    title: string;
    model?: SessionModel;
    agent?: string;
  }): Promise<{ id: string }> {
    this.sessions.push(input);
    return { id: `session-${this.sessions.length}` };
  }

  async runPrompt(input: {
    sessionID: string;
    text: string;
    signal?: AbortSignal;
    onUsage?: (usage: Partial<TurnUsage>) => void;
  }): Promise<OpenCodePromptResult> {
    this.prompts.push(input);
    input.signal?.throwIfAborted();
    this.onRun?.(input);
    const reply = this.replies.shift();
    const result: OpenCodePromptResult =
      typeof reply === 'string' || reply === undefined ? { text: reply ?? '' } : reply;
    if (result.usage !== undefined) input.onUsage?.(result.usage);
    return result;
  }

  async close(): Promise<void> {
    this.closed += 1;
  }
}

function request(skill: 'propose' | 'apply', workspace = '/workspace'): OpenCodeSkillRequest {
  return { skill, workspace, prompt: `run the ${skill} workflow` };
}

describe('EmbeddedOpenCodeClient', () => {
  it('runs each turn in a fresh session at the turn workspace', async () => {
    const host = new FakeHost(['first', 'second']);
    const client = new EmbeddedOpenCodeClient(async () => host);

    const propose = await client.runSkill(request('propose', '/a'));
    const apply = await client.runSkill(request('apply', '/b'));

    expect(host.sessions).toEqual([
      { directory: '/a', title: 'OpenSpec propose turn' },
      { directory: '/b', title: 'OpenSpec apply turn' },
    ]);
    expect(host.prompts.map((prompt) => prompt.sessionID)).toEqual(['session-1', 'session-2']);
    expect(propose.summary).toBe('first');
    expect(apply.summary).toBe('second');
  });

  it('creates the host once and reuses it across turns', async () => {
    const host = new FakeHost();
    let created = 0;
    const client = new EmbeddedOpenCodeClient(async () => {
      created += 1;
      return host;
    });

    await client.runSkill(request('propose'));
    await client.runSkill(request('propose'));

    expect(created).toBe(1);
  });

  it('reports the agent text as the summary and leaves unextracted fields empty', async () => {
    const host = new FakeHost(['  the change is ready  ']);
    const client = new EmbeddedOpenCodeClient(async () => host);

    const result = await client.runSkill(request('propose'));

    expect(result).toEqual({
      commits: [],
      summary: 'the change is ready',
      questions: [],
      needsInput: false,
      agentClaimsReady: false,
    });
  });

  it('reports the turn usage on the result and through onUsage', async () => {
    const usage: TurnUsage = {
      model: 'greenpt/deepseek-v4.1-flash',
      input: 10,
      output: 5,
      reasoning: 2,
      cacheRead: 2,
      cacheWrite: 1,
      tokens: 20,
    };
    const host = new FakeHost([{ text: 'done', usage }]);
    const client = new EmbeddedOpenCodeClient(async () => host);
    const streamed: Partial<TurnUsage>[] = [];

    const result = await client.runSkill({
      ...request('propose'),
      onUsage: (reported) => streamed.push(reported),
    });

    expect(result.usage).toEqual(usage);
    expect(streamed).toEqual([usage]);
  });

  it('passes the abort signal through to the host', async () => {
    const host = new FakeHost();
    const client = new EmbeddedOpenCodeClient(async () => host);
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.runSkill({ ...request('propose'), signal: controller.signal }),
    ).rejects.toThrowError(/aborted/i);
  });

  it('runs every session on the configured model and agent', async () => {
    const host = new FakeHost();
    const client = new EmbeddedOpenCodeClient(async () => host, {
      model: { providerID: 'greenpt', id: 'deepseek-v4.1-flash' },
      agent: 'build',
    });

    await client.runSkill(request('propose'));

    expect(host.sessions[0]).toMatchObject({
      model: { providerID: 'greenpt', id: 'deepseek-v4.1-flash' },
      agent: 'build',
    });
  });

  it('closes the host on dispose and is a no-op before any turn', async () => {
    const host = new FakeHost();
    const client = new EmbeddedOpenCodeClient(async () => host);

    await client.dispose();
    expect(host.closed).toBe(0);

    await client.runSkill(request('propose'));
    await client.dispose();
    expect(host.closed).toBe(1);
  });
});
