import { describe, expect, it } from 'vitest';

import type { EnvironmentSpec } from '../../config/types.js';
import type { TurnUsage } from '../../domain/types.js';
import type {
  ContainerRunOptions,
  ContainerRunResult,
  ContainerRunner,
} from '../../system/commands.js';
import type { OpenCodeClient, OpenCodeSkillRequest, OpenCodeSkillResult } from './client.js';
import {
  ContainerOpenCodeClient,
  DEFAULT_RUNNER_MOUNT,
  EnvironmentOpenCodeClient,
  scopeCacheVolumes,
} from './container-client.js';

const ENVIRONMENT: EnvironmentSpec = {
  image: 'ghcr.io/acme/agent-java:latest',
  network: 'host',
  env: ['GREENPT_API_KEY'],
  gitIdentity: { name: 'OpenSpec Agent', email: 'agent@example.com' },
  caches: [{ name: 'gradle', path: '/home/agent/.gradle' }],
};

const RESULT: OpenCodeSkillResult = {
  commits: ['c1'],
  summary: 'did the work',
  questions: [],
  needsInput: false,
  agentClaimsReady: true,
};

function skillRequest(overrides: Partial<OpenCodeSkillRequest> = {}): OpenCodeSkillRequest {
  return {
    skill: 'propose',
    workspace: '/tmp/turn/worktree',
    prompt: 'do the thing',
    repo: { owner: 'acme', name: 'widget' },
    store: '/home/agent/workspace/acme/widget',
    environment: ENVIRONMENT,
    ...overrides,
  };
}

/** A fake `ContainerRunner` that emits scripted events and records the argv. */
class FakeContainerRunner implements ContainerRunner {
  readonly calls: ContainerRunOptions[] = [];
  constructor(
    private readonly handler: (options: ContainerRunOptions) => Promise<ContainerRunResult>,
  ) {}

  run(options: ContainerRunOptions): Promise<ContainerRunResult> {
    this.calls.push(options);
    return this.handler(options);
  }
}

function eventsRunner(
  events: unknown[],
  outcome: ContainerRunResult = { code: 0, stdout: '', stderr: '' },
): FakeContainerRunner {
  return new FakeContainerRunner(async (options) => {
    for (const event of events) options.onStdout?.(`${JSON.stringify(event)}\n`);
    return outcome;
  });
}

function client(runner: ContainerRunner, sdkVersion = '2.0.31'): ContainerOpenCodeClient {
  return new ContainerOpenCodeClient({
    runnerDir: '/app/dist',
    model: 'greenpt/deepseek#flash',
    agent: 'build',
    database: '/data/opencode.db',
    runner,
    sdkVersion,
  });
}

describe('ContainerOpenCodeClient', () => {
  it('builds the container argv from the environment and runs the turn', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);
    const result = await client(runner).runSkill(skillRequest());

    expect(result).toEqual(RESULT);
    const call = runner.calls[0];
    expect(call?.command).toBe('docker');
    const args = call?.args ?? [];
    expect(args.slice(0, 3)).toEqual(['run', '--rm', '-i']);
    expect(args).toContain('/tmp/turn/worktree:/tmp/turn/worktree');
    expect(args).toContain('/home/agent/workspace/acme/widget:/home/agent/workspace/acme/widget');
    expect(args).toContain('/app/dist:/opt/runner/dist:ro');
    expect(args).toContain('orchestrator-acme-widget-gradle:/home/agent/.gradle');
    expect(args).toContain('--network');
    expect(args).toContain('host');
    expect(args).toContain('GREENPT_API_KEY');
    expect(args).toContain('GIT_AUTHOR_NAME=OpenSpec Agent');
    expect(args.slice(-3)).toEqual([
      'ghcr.io/acme/agent-java:latest',
      'node',
      '/opt/runner/dist/runner.js',
    ]);
    expect(call?.input).toContain('"skill":"propose"');
    expect(call?.input).toContain('"expectedSdkVersion":"2.0.31"');
  });

  it('forwards usage events before resolving', async () => {
    const usage: Partial<TurnUsage> = { model: 'greenpt/deepseek', tokens: 7 };
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'usage', usage },
      { type: 'result', result: RESULT },
    ]);
    const seen: Partial<TurnUsage>[] = [];

    await client(runner).runSkill(skillRequest({ onUsage: (u) => seen.push(u) }));

    expect(seen).toEqual([usage]);
  });

  it('rejects when the container exits unsuccessfully', async () => {
    const runner = eventsRunner([{ type: 'ready', sdkVersion: '2.0.31' }], {
      code: 137,
      stdout: '',
      stderr: 'cannot start image',
    });

    await expect(client(runner).runSkill(skillRequest())).rejects.toThrowError(
      /exited with code 137: cannot start image/,
    );
  });

  it('rejects when the container reports a terminal error', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'error', error: 'the model errored' },
    ]);

    await expect(client(runner).runSkill(skillRequest())).rejects.toThrowError('the model errored');
  });

  it('rejects a missing result on a successful exit', async () => {
    const runner = eventsRunner([{ type: 'ready', sdkVersion: '2.0.31' }]);
    await expect(client(runner).runSkill(skillRequest())).rejects.toThrowError(
      /returned no turn result/,
    );
  });

  it('rejects a malformed event', async () => {
    const runner = new FakeContainerRunner(async (options) => {
      options.onStdout?.('{not json}\n');
      return { code: 0, stdout: '', stderr: '' };
    });
    await expect(client(runner).runSkill(skillRequest())).rejects.toThrowError(/malformed event/);
  });

  it('rejects when the image SDK version does not match', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '1.0.0' },
      { type: 'result', result: RESULT },
    ]);
    await expect(client(runner).runSkill(skillRequest())).rejects.toThrowError(
      /does not match the orchestrator's/,
    );
  });

  it('maps a provisioning failure to an error', async () => {
    const runner = new FakeContainerRunner(async () => {
      throw new Error('docker: command not found');
    });
    await expect(client(runner).runSkill(skillRequest())).rejects.toThrowError(
      /could not start the environment container: docker: command not found/,
    );
  });

  it('kills the container and rejects when the turn aborts', async () => {
    const controller = new AbortController();
    controller.abort();
    const runner = new FakeContainerRunner(async (options) => {
      expect(options.signal?.aborted).toBe(true);
      return { code: null, stdout: '', stderr: '' };
    });

    await expect(
      client(runner).runSkill(skillRequest({ signal: controller.signal })),
    ).rejects.toThrowError(/aborted/);
  });

  it('rejects a request without an environment', async () => {
    const runner = eventsRunner([{ type: 'result', result: RESULT }]);
    await expect(
      client(runner).runSkill(skillRequest({ environment: undefined })),
    ).rejects.toThrowError(/requires a configured environment/);
    expect(runner.calls).toHaveLength(0);
  });

  it('rejects a request without a store path', async () => {
    const runner = eventsRunner([{ type: 'result', result: RESULT }]);
    await expect(client(runner).runSkill(skillRequest({ store: undefined }))).rejects.toThrowError(
      /requires the repository store path/,
    );
  });

  it('exposes the default runner mount', () => {
    expect(DEFAULT_RUNNER_MOUNT).toBe('/opt/runner/dist');
  });
});

describe('scopeCacheVolumes', () => {
  it('scopes a cache volume per repository', () => {
    expect(
      scopeCacheVolumes({ owner: 'acme', name: 'Widget.Repo' }, [
        { name: 'gradle', path: '/home/agent/.gradle' },
      ]),
    ).toEqual([{ volume: 'orchestrator-acme-widget.repo-gradle', path: '/home/agent/.gradle' }]);
  });
});

describe('EnvironmentOpenCodeClient', () => {
  class RecordingClient implements OpenCodeClient {
    readonly calls: OpenCodeSkillRequest[] = [];
    constructor(private readonly tag: string) {}
    runSkill(request: OpenCodeSkillRequest): Promise<OpenCodeSkillResult> {
      this.calls.push(request);
      return Promise.resolve({ ...RESULT, summary: this.tag });
    }
  }

  it('routes an environment turn to the container client', async () => {
    const embedded = new RecordingClient('embedded');
    const container = new RecordingClient('container');
    const routing = new EnvironmentOpenCodeClient(embedded, container);

    const result = await routing.runSkill(skillRequest());

    expect(result.summary).toBe('container');
    expect(embedded.calls).toHaveLength(0);
    expect(container.calls).toHaveLength(1);
  });

  it('routes a turn without an environment to the embedded client', async () => {
    const embedded = new RecordingClient('embedded');
    const container = new RecordingClient('container');
    const routing = new EnvironmentOpenCodeClient(embedded, container);

    const result = await routing.runSkill(skillRequest({ environment: undefined }));

    expect(result.summary).toBe('embedded');
    expect(embedded.calls).toHaveLength(1);
    expect(container.calls).toHaveLength(0);
  });
});
