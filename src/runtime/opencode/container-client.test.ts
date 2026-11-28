import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { EnvironmentSpec } from '../../config/types.js';
import type { TurnUsage } from '../../domain/types.js';
import type { HardwareManifest } from '../hardware.js';
import type {
  ContainerRunOptions,
  ContainerRunResult,
  ContainerRunner,
} from '../../system/commands.js';
import type { OpenCodeClient, OpenCodeSkillRequest, OpenCodeSkillResult } from './client.js';
import {
  ContainerOpenCodeClient,
  type ContainerOpenCodeClientOptions,
  DEFAULT_RUNNER_MOUNT,
  EnvironmentOpenCodeClient,
  resolveImageReference,
  scopeCacheVolumes,
} from './container-client.js';

const cleanups: string[] = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A temporary directory removed after the test. */
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'container-client-'));
  cleanups.push(dir);
  return dir;
}

const ENVIRONMENT: EnvironmentSpec = {
  image: 'ghcr.io/acme/agent-java',
  network: 'host',
  env: ['LLM_API_KEY'],
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

function client(
  runner: ContainerRunner,
  sdkVersion = '2.0.31',
  overrides: Partial<ContainerOpenCodeClientOptions> = {},
): ContainerOpenCodeClient {
  return new ContainerOpenCodeClient({
    runnerDir: '/app/dist',
    model: 'greenpt/deepseek#flash',
    agent: 'build',
    database: '/data/opencode.db',
    runner,
    sdkVersion,
    ...overrides,
  });
}

/** A group resolver naming `dialout` as gid 20 and nothing else. */
async function dialoutOnly(name: string): Promise<number | undefined> {
  return name === 'dialout' ? 20 : undefined;
}

describe('resolveImageReference', () => {
  it('selects the SDK tag for an untagged image', () => {
    expect(resolveImageReference('ghcr.io/wuan/simple-orchestrator/rust', '2.2.7')).toBe(
      'ghcr.io/wuan/simple-orchestrator/rust:sdk-2.2.7',
    );
  });

  it('keeps an explicit tag', () => {
    expect(resolveImageReference('ghcr.io/acme/agent-java:latest', '2.2.7')).toBe(
      'ghcr.io/acme/agent-java:latest',
    );
  });

  it('keeps a digest reference', () => {
    const digest = 'ghcr.io/acme/agent-java@sha256:abc';
    expect(resolveImageReference(digest, '2.2.7')).toBe(digest);
  });

  it('does not mistake a registry port for a tag', () => {
    expect(resolveImageReference('localhost:5000/agent', '2.2.7')).toBe(
      'localhost:5000/agent:sdk-2.2.7',
    );
  });
});

describe('ContainerOpenCodeClient', () => {
  it('builds the container argv from the environment and runs the turn', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);
    const result = await client(runner).runSkill(skillRequest());

    expect(result).toEqual(RESULT);
    const call = runner.calls.at(-1);
    expect(call?.command).toBe('docker');
    const args = call?.args ?? [];
    expect(args.slice(0, 3)).toEqual(['run', '--rm', '-i']);
    expect(args).toContain('/tmp/turn/worktree:/tmp/turn/worktree');
    expect(args).toContain('/home/agent/workspace/acme/widget:/home/agent/workspace/acme/widget');
    expect(args).toContain('/app/dist:/opt/runner/dist:ro');
    expect(args).toContain('orchestrator-acme-widget-gradle:/home/agent/.gradle');
    expect(args).toContain('--network');
    expect(args).toContain('host');
    expect(args).toContain('LLM_API_KEY');
    expect(args).toContain('GIT_AUTHOR_NAME=OpenSpec Agent');
    expect(args.slice(-3)).toEqual([
      'ghcr.io/acme/agent-java:sdk-2.0.31',
      'node',
      '/opt/runner/dist/runner.js',
    ]);
    expect(call?.input).toContain('"skill":"propose"');
    expect(call?.input).toContain('"expectedSdkVersion":"2.0.31"');
  });

  it('checks the registry by default before starting a turn', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);

    await client(runner).runSkill(skillRequest());

    const args = runner.calls.at(-1)?.args ?? [];
    expect(args[args.indexOf('--pull') + 1]).toBe('always');
    // The flag stays ahead of the image reference it applies to.
    expect(args.indexOf('--pull')).toBeLessThan(args.indexOf('ghcr.io/acme/agent-java:sdk-2.0.31'));
  });

  it('forwards a configured image pull policy', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);

    await client(runner).runSkill(skillRequest({ environment: { ...ENVIRONMENT, pull: 'never' } }));

    const args = runner.calls.at(-1)?.args ?? [];
    expect(args[args.indexOf('--pull') + 1]).toBe('never');
  });

  it('does not re-check a digest-pinned image even when the policy is always', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);
    const digest = `ghcr.io/acme/agent-java@sha256:${'a'.repeat(64)}`;

    await client(runner).runSkill(
      skillRequest({ environment: { ...ENVIRONMENT, image: digest, pull: 'always' } }),
    );

    const args = runner.calls.at(-1)?.args ?? [];
    expect(args[args.indexOf('--pull') + 1]).toBe('missing');
  });

  it('prepares each cache volume as root before the turn runs', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);

    await client(runner).runSkill(skillRequest());

    expect(runner.calls).toHaveLength(2);
    const prepare = runner.calls[0];
    expect(prepare?.args.slice(0, 2)).toEqual(['run', '--rm']);
    expect(prepare?.args).toContain('0:0');
    expect(prepare?.args).toContain('--entrypoint');
    expect(prepare?.args).toContain('chown');
    expect(prepare?.args).toContain('orchestrator-acme-widget-gradle:/home/agent/.gradle');
    expect(prepare?.args.at(-1)).toBe('/home/agent/.gradle');
    // The turn follows preparation and mounts the runner read-only.
    expect(runner.calls.at(-1)?.args).toContain('/app/dist:/opt/runner/dist:ro');
  });

  it('prepares a cache volume once per process', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);
    const instance = client(runner);

    await instance.runSkill(skillRequest());
    await instance.runSkill(skillRequest());

    const prepares = runner.calls.filter((call) => call.args.includes('--entrypoint'));
    expect(prepares).toHaveLength(1);
  });

  it('runs the turn when a cache volume cannot be prepared', async () => {
    const runner = new FakeContainerRunner(async (options) => {
      if (options.args.includes('--entrypoint')) {
        return { code: 1, stdout: '', stderr: 'chown: not found' };
      }
      options.onStdout?.(`${JSON.stringify({ type: 'ready', sdkVersion: '2.0.31' })}\n`);
      options.onStdout?.(`${JSON.stringify({ type: 'result', result: RESULT })}\n`);
      return { code: 0, stdout: '', stderr: '' };
    });

    await expect(client(runner).runSkill(skillRequest())).resolves.toEqual(RESULT);
  });

  it('passes the configured endpoint and provider variable into the turn', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);
    const configured = new ContainerOpenCodeClient({
      runnerDir: '/app/dist',
      model: 'greenpt/deepseek#flash',
      apiEndpoint: 'https://llm.example.com/v1',
      apiKeyEnv: 'ACME_API_KEY',
      runner,
      sdkVersion: '2.0.31',
    });

    await configured.runSkill(skillRequest());

    const call = runner.calls.at(-1);
    expect(call?.args).toContain('ACME_API_KEY');
    // The environment still names its own variable, so both are forwarded.
    expect(call?.args).toContain('LLM_API_KEY');
    expect(call?.input).toContain('"apiEndpoint":"https://llm.example.com/v1"');
    expect(call?.input).toContain('"apiKeyEnv":"ACME_API_KEY"');
  });

  it('deduplicates a provider variable the environment already names', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);
    const configured = new ContainerOpenCodeClient({
      runnerDir: '/app/dist',
      model: 'greenpt/deepseek#flash',
      apiKeyEnv: 'LLM_API_KEY',
      runner,
      sdkVersion: '2.0.31',
    });

    await configured.runSkill(skillRequest());

    const args = runner.calls.at(-1)?.args ?? [];
    expect(args.filter((arg) => arg === 'LLM_API_KEY')).toHaveLength(1);
  });

  it('uses an explicitly tagged image verbatim', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);
    const environment: EnvironmentSpec = {
      ...ENVIRONMENT,
      image: 'ghcr.io/acme/agent-java:latest',
    };

    await client(runner).runSkill(skillRequest({ environment }));

    const call = runner.calls.at(-1);
    expect(call?.args.slice(-3)).toEqual([
      'ghcr.io/acme/agent-java:latest',
      'node',
      '/opt/runner/dist/runner.js',
    ]);
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

  it('resolves a configured group name to the host gid', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);

    await client(runner, '2.0.31', { resolveGroup: dialoutOnly }).runSkill(
      skillRequest({ environment: { ...ENVIRONMENT, groups: ['dialout'] } }),
    );

    const args = runner.calls.at(-1)?.args ?? [];
    expect(args[args.indexOf('--group-add') + 1]).toBe('20');
  });

  it('passes a numeric gid through without resolving it', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);
    const resolveGroup = async (): Promise<number | undefined> => {
      throw new Error('a numeric gid must not be resolved');
    };

    await client(runner, '2.0.31', { resolveGroup }).runSkill(
      skillRequest({ environment: { ...ENVIRONMENT, groups: [995] } }),
    );

    const args = runner.calls.at(-1)?.args ?? [];
    expect(args[args.indexOf('--group-add') + 1]).toBe('995');
  });

  it('fails the turn naming a configured group that does not exist', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);

    await expect(
      client(runner, '2.0.31', { resolveGroup: dialoutOnly }).runSkill(
        skillRequest({ environment: { ...ENVIRONMENT, groups: ['wheel'] } }),
      ),
    ).rejects.toThrowError(/group 'wheel'/);
    expect(runner.calls).toHaveLength(0);
  });

  it('exposes a configured character device at its host path', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);

    await client(runner).runSkill(
      skillRequest({ environment: { ...ENVIRONMENT, devices: [{ path: '/dev/null' }] } }),
    );

    const args = runner.calls.at(-1)?.args ?? [];
    expect(args[args.indexOf('--device') + 1]).toBe('/dev/null:/dev/null');
  });

  it('fails the turn naming an absent device path', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);
    const missing = join(await tempDir(), 'missing');

    await expect(
      client(runner).runSkill(
        skillRequest({ environment: { ...ENVIRONMENT, devices: [{ path: missing }] } }),
      ),
    ).rejects.toThrowError(missing);
    expect(runner.calls).toHaveLength(0);
  });

  it('fails the turn naming a dangling device symlink', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);
    const dir = await tempDir();
    const link = join(dir, 'qtpy2');
    await symlink(join(dir, 'missing'), link);

    await expect(
      client(runner).runSkill(
        skillRequest({ environment: { ...ENVIRONMENT, devices: [{ path: link }] } }),
      ),
    ).rejects.toThrowError(link);
    expect(runner.calls).toHaveLength(0);
  });

  it('fails the turn naming a path that is not a character device', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);
    const path = join(await tempDir(), 'regular');
    await writeFile(path, 'not a device\n');

    await expect(
      client(runner).runSkill(
        skillRequest({ environment: { ...ENVIRONMENT, devices: [{ path }] } }),
      ),
    ).rejects.toThrowError(/regular' is not a character device/);
    expect(runner.calls).toHaveLength(0);
  });

  it('passes a stable symlink path to Docker and re-resolves its target each turn', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);
    const dir = await tempDir();
    const link = join(dir, 'qtpy2');
    await symlink('/dev/null', link);
    const instance = client(runner);
    const environment: EnvironmentSpec = { ...ENVIRONMENT, devices: [{ path: link }] };

    await instance.runSkill(skillRequest({ environment }));
    const first = runner.calls.at(-1)?.args ?? [];
    expect(first[first.indexOf('--device') + 1]).toBe(`${link}:${link}`);

    // The device is "replugged": the stable name now points at a different
    // character device, and the next turn maps the same configured path.
    await rm(link);
    await symlink('/dev/zero', link);
    await instance.runSkill(skillRequest({ environment }));
    const second = runner.calls.at(-1)?.args ?? [];
    expect(second[second.indexOf('--device') + 1]).toBe(`${link}:${link}`);

    // Repointing the name at a non-device proves the check re-resolves rather
    // than trusting the target cached from the first turn.
    await rm(link);
    await writeFile(link, 'not a device\n');
    await expect(instance.runSkill(skillRequest({ environment }))).rejects.toThrowError(link);
  });

  it('keeps the previous argv when the environment names no devices or groups', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);

    await client(runner).runSkill(skillRequest());

    const args = runner.calls.at(-1)?.args ?? [];
    expect(args).not.toContain('--device');
    expect(args).not.toContain('--group-add');
  });

  it('maps described device entries to their host paths', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);

    await client(runner).runSkill(
      skillRequest({
        environment: {
          ...ENVIRONMENT,
          devices: [{ path: '/dev/null', description: 'a test device' }],
        },
      }),
    );

    const args = runner.calls.at(-1)?.args ?? [];
    expect(args[args.indexOf('--device') + 1]).toBe('/dev/null:/dev/null');
  });

  it('carries the hardware manifest in the runner payload', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);
    const hardware: HardwareManifest = {
      devices: [
        { path: '/dev/null', description: 'a test device', identity: { vendorId: '0001' } },
      ],
    };

    await client(runner).runSkill(skillRequest({ hardware }));

    const input = runner.calls.at(-1)?.input ?? '';
    expect(input).toContain('"hardware"');
    expect(input).toContain('"description":"a test device"');
    expect(input).toContain('"vendorId":"0001"');
  });

  it('logs the resolved inventory only when a logger is provided', async () => {
    const runner = eventsRunner([
      { type: 'ready', sdkVersion: '2.0.31' },
      { type: 'result', result: RESULT },
    ]);
    const hardware: HardwareManifest = {
      devices: [
        { path: '/dev/null', description: 'a test device', identity: { vendorId: '0001' } },
      ],
    };
    const messages: string[] = [];

    await client(runner, '2.0.31', { logger: (message) => messages.push(message) }).runSkill(
      skillRequest({ hardware }),
    );

    expect(messages).toContain('hardware /dev/null: a test device (vendor 0001)');

    // Without a logger injected, no diagnostic is produced.
    await client(runner).runSkill(skillRequest({ hardware }));
    expect(messages).toHaveLength(1);
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
