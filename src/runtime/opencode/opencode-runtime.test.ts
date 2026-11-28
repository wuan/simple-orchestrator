import { describe, expect, it } from 'vitest';

import { DEFAULT_LIMITS, type EnvironmentSpec } from '../../config/types.js';
import type { TurnContext, TurnSkill } from '../../domain/types.js';
import type { HardwareManifest } from '../hardware.js';
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

function request(skill: TurnSkill, environment?: EnvironmentSpec): TurnRequest {
  return {
    context: context(skill),
    workspace: '/workspace',
    limits: DEFAULT_LIMITS,
    ...(environment === undefined ? {} : { environment }),
  };
}

const HARDWARE_ENVIRONMENT: EnvironmentSpec = {
  image: 'ghcr.io/acme/agent-platformio:latest',
  devices: [
    { path: '/dev/qtpy2', description: 'Adafruit QT Py ESP32-S2' },
    { path: '/dev/jtum120' },
  ],
};

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
    expect(prompt).toContain('do not merge');
  });

  it('states the orchestrator publishes the branch and tells the turn not to push', () => {
    const prompt = buildSkillPrompt(context('apply'));
    expect(prompt).toContain('orchestrator publishes that branch after the turn');
    expect(prompt).toContain('do not push');
  });

  it('tells the turn not to report push status', () => {
    const prompt = buildSkillPrompt(context('apply'));
    expect(prompt).toContain('Do not comment on whether the branch has been pushed');
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

  it('advertises exposed hardware and names the manifest path', () => {
    const manifest: HardwareManifest = {
      devices: [
        {
          path: '/dev/qtpy2',
          description: 'Adafruit QT Py ESP32-S2',
          identity: {
            vendorId: '239a',
            productId: '8111',
            model: 'QT_Py_ESP32-S2',
            serial: 'ABC',
          },
        },
        {
          path: '/dev/jtum120',
          identity: { vendorId: '2e3c', productId: '5558', model: 'JT-UM120 meter' },
        },
      ],
    };

    const prompt = buildSkillPrompt(context('apply'), manifest);

    expect(prompt).toContain('Hardware exposed to this turn:');
    expect(prompt).toContain(
      '- /dev/qtpy2 - Adafruit QT Py ESP32-S2 (USB 239a:8111, QT_Py_ESP32-S2, serial ABC)',
    );
    expect(prompt).toContain('- /dev/jtum120 - USB 2e3c:5558, JT-UM120 meter');
    expect(prompt).toContain('Full detail: /tmp/orchestrator-hardware.json');
    expect(prompt).toContain('documented by the repository');
  });

  it('leaves the instruction unchanged when no devices are exposed', () => {
    expect(buildSkillPrompt(context('apply'), { devices: [] })).toBe(
      buildSkillPrompt(context('apply')),
    );
    expect(buildSkillPrompt(context('apply'))).not.toContain('Hardware exposed to this turn');
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

  it('builds the hardware manifest and hands it to the client', async () => {
    const client = new ScriptedClient(RESULTS);
    const probe = async (path: string) =>
      path === '/dev/qtpy2'
        ? { vendorId: '239a', productId: '8111', model: 'QT_Py_ESP32-S2' }
        : { vendorId: '2e3c', productId: '5558', model: 'JT-UM120 meter' };

    await new OpenCodeRuntime(client, { probe }).run(request('apply', HARDWARE_ENVIRONMENT));

    const call = client.calls[0];
    expect(call?.hardware).toEqual({
      devices: [
        {
          path: '/dev/qtpy2',
          description: 'Adafruit QT Py ESP32-S2',
          identity: { vendorId: '239a', productId: '8111', model: 'QT_Py_ESP32-S2' },
        },
        {
          path: '/dev/jtum120',
          identity: { vendorId: '2e3c', productId: '5558', model: 'JT-UM120 meter' },
        },
      ],
    });
    expect(call?.prompt).toContain('Hardware exposed to this turn:');
    expect(call?.prompt).toContain('Full detail: /tmp/orchestrator-hardware.json');
  });

  it('leaves an environment with no devices unadvertised', async () => {
    const client = new ScriptedClient(RESULTS);

    await new OpenCodeRuntime(client).run(
      request('apply', { image: 'ghcr.io/acme/agent-java:latest' }),
    );

    const call = client.calls[0];
    expect(call?.hardware).toBeUndefined();
    expect(call?.prompt).not.toContain('Hardware exposed to this turn');
  });

  it('does not advertise an ambient host device the environment omits', async () => {
    const client = new ScriptedClient(RESULTS);
    const probe = async (path: string) =>
      path === '/dev/ambient' ? { vendorId: 'ffff', productId: '0001' } : { vendorId: '239a' };

    await new OpenCodeRuntime(client, { probe }).run(
      request('apply', {
        image: 'ghcr.io/acme/agent-platformio:latest',
        devices: [{ path: '/dev/qtpy2' }],
      }),
    );

    const call = client.calls[0];
    expect(call?.hardware?.devices.map((device) => device.path)).toEqual(['/dev/qtpy2']);
    expect(call?.prompt).not.toContain('/dev/ambient');
  });
});
