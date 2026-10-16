import { describe, expect, it } from 'vitest';

import { DEFAULT_LIMITS } from '../../config/types.js';
import type { TurnContext, TurnSkill } from '../../domain/types.js';
import type { TurnRequest } from '../types.js';
import type { OpenCodeClient, OpenCodeSkillRequest, OpenCodeSkillResult } from './client.js';
import { buildSkillPrompt, OpenCodeRuntime } from './opencode-runtime.js';

class ScriptedClient implements OpenCodeClient {
  readonly calls: OpenCodeSkillRequest[] = [];
  constructor(private readonly results: Record<TurnSkill, OpenCodeSkillResult>) {}
  async runSkill(request: OpenCodeSkillRequest): Promise<OpenCodeSkillResult> {
    this.calls.push(request);
    return this.results[request.skill];
  }
}

const REPO = { owner: 'acme', name: 'widget' };

function context(skill: TurnSkill, pendingBaseIntegration?: boolean): TurnContext {
  return {
    skill,
    repo: REPO,
    issue: { repo: REPO, number: 1 },
    pullRequest: { repo: REPO, number: 10 },
    branch: 'openspec/issue-1',
    baseBranch: 'main',
    changeName: 'add-x',
    transcript: [],
    pendingFeedback: [],
    ...(pendingBaseIntegration === undefined ? {} : { pendingBaseIntegration }),
  };
}

function request(skill: TurnSkill): TurnRequest {
  return { context: context(skill), workspace: '/workspace', limits: DEFAULT_LIMITS };
}

const RESULTS: Record<TurnSkill, OpenCodeSkillResult> = {
  propose: {
    commits: ['c1'],
    summary: 'proposed the change',
    questions: ['which database?'],
    needsInput: true,
    agentClaimsReady: false,
  },
  apply: {
    commits: ['c2', 'c3'],
    summary: 'implemented and archived',
    questions: [],
    needsInput: false,
    agentClaimsReady: true,
  },
};

describe('buildSkillPrompt', () => {
  it('names the change, branch, and constraints', () => {
    const prompt = buildSkillPrompt(context('propose'));
    expect(prompt).toContain('add-x');
    expect(prompt).toContain('openspec/issue-1');
    expect(prompt).toContain('never merge');
  });

  it('instructs the apply skill to archive', () => {
    expect(buildSkillPrompt(context('apply'))).toContain('openspec archive');
  });

  it('tells the turn to resolve a pending base merge only when flagged', () => {
    expect(buildSkillPrompt(context('propose', true))).toContain(
      'unresolved merge of the base branch `main`',
    );
    expect(buildSkillPrompt(context('propose', false))).not.toContain('unresolved merge');
  });
});

describe('OpenCodeRuntime', () => {
  it('runs a propose turn and returns questions', async () => {
    const client = new ScriptedClient(RESULTS);
    const result = await new OpenCodeRuntime(client).run(request('propose'));
    expect(result).toMatchObject({
      skill: 'propose',
      commits: ['c1'],
      questions: ['which database?'],
      needsInput: true,
    });
    expect(client.calls[0]?.prompt).toContain('OpenSpec `propose`');
  });

  it('runs an apply turn producing code and archive commits', async () => {
    const client = new ScriptedClient(RESULTS);
    const result = await new OpenCodeRuntime(client).run(request('apply'));
    expect(result.skill).toBe('apply');
    expect(result.commits).toEqual(['c2', 'c3']);
    expect(client.calls[0]?.skill).toBe('apply');
  });
});
