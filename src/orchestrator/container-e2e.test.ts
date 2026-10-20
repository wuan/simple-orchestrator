import { describe, expect, it } from 'vitest';

import { DEFAULT_LABELS, type EnvironmentSpec } from '../config/types.js';
import { FakeProvider } from '../provider/fake/fake-provider.js';
import type { OpenCodeSkillResult } from '../runtime/opencode/client.js';
import { ContainerOpenCodeClient } from '../runtime/opencode/container-client.js';
import { OpenCodeRuntime } from '../runtime/opencode/opencode-runtime.js';
import type {
  ContainerRunOptions,
  ContainerRunResult,
  ContainerRunner,
} from '../system/commands.js';
import { Poller } from './poller.js';
import { FakeOpenspecCli } from './testing/fake-openspec.js';
import { FakeSandbox } from './testing/fake-sandbox.js';
import { parseUsageMarker } from './usage.js';

const SDK_VERSION = '2.0.31';

function proposeResult(): OpenCodeSkillResult {
  return {
    commits: ['proposal-commit'],
    summary: 'proposed the change',
    questions: [],
    needsInput: false,
    agentClaimsReady: false,
  };
}

function applyResult(): OpenCodeSkillResult {
  return {
    commits: ['code-commit', 'archive-commit'],
    summary: 'implemented and archived',
    questions: [],
    needsInput: false,
    agentClaimsReady: true,
  };
}

/**
 * Stands in for the container process: it reads the JSON request the client
 * wrote to stdin, asks for the matching skill's result, and streams the runner
 * protocol back over stdout.
 */
class FakeContainerRunner implements ContainerRunner {
  readonly calls: ContainerRunOptions[] = [];

  async run(options: ContainerRunOptions): Promise<ContainerRunResult> {
    this.calls.push(options);
    const request = JSON.parse(options.input) as { skill: 'propose' | 'apply' };
    const result = request.skill === 'apply' ? applyResult() : proposeResult();
    const emit = (event: unknown): void => options.onStdout?.(`${JSON.stringify(event)}\n`);
    emit({ type: 'ready', sdkVersion: SDK_VERSION });
    emit({ type: 'usage', usage: { model: 'container/model', input: 3, tokens: 3, steps: 1 } });
    emit({ type: 'result', result });
    return { code: 0, stdout: '', stderr: '' };
  }
}

async function labelsOf(provider: FakeProvider, number: number): Promise<string[]> {
  return (await provider.getPullRequest({ repo: provider.repo, number }))?.labels ?? [];
}

describe('containerized end-to-end workflow', () => {
  it('drives propose -> revise -> approve -> apply -> merge through the container client', async () => {
    const provider = new FakeProvider();
    const openspec = new FakeOpenspecCli();
    openspec.markInProgress('add-x');
    provider.seedIssue({ number: 1, labels: ['openspec'] });

    const runner = new FakeContainerRunner();
    const client = new ContainerOpenCodeClient({
      runnerDir: '/app/dist',
      runner,
      sdkVersion: SDK_VERSION,
    });
    const environment: EnvironmentSpec = {
      image: 'openspec-environment-node:latest',
      gitIdentity: { name: 'OpenSpec Agent', email: 'agent@example.com' },
    };
    const sandbox = new FakeSandbox();
    const poller = new Poller({
      provider,
      runtime: new OpenCodeRuntime(client),
      sandbox,
      openspec,
      labels: DEFAULT_LABELS,
      baseBranch: 'main',
      environment,
    });

    // 1. Propose: the turn runs in the container, the host publishes the branch,
    // and readiness is evaluated on the host (the fake CLI is the only source).
    await poller.pollOnce();
    expect(await labelsOf(provider, 100)).toContain(DEFAULT_LABELS.proposing);
    expect(provider.pushes.map((push) => push.branch)).toEqual(['openspec/issue-1']);
    expect(openspec.calls).toContain('status:add-x');

    // 2. A review drives a revise turn; the host-set readiness predicate flips.
    provider.seedReview(100, { state: 'changes_requested', body: 'tighten the scope' });
    openspec.markReady('add-x');
    await poller.pollOnce();
    expect(await labelsOf(provider, 100)).toContain(DEFAULT_LABELS.ready);
    expect(provider.pushes).toHaveLength(2);
    expect(openspec.calls).toContain('validate:add-x');

    // 3. Approve: the apply turn runs in the container and the host releases the
    // draft pull request.
    provider.seedReview(100, { state: 'approved', body: 'lgtm' });
    await poller.pollOnce();
    expect(await labelsOf(provider, 100)).toContain(DEFAULT_LABELS.implementing);
    expect((await provider.getPullRequest({ repo: provider.repo, number: 100 }))?.draft).toBe(
      false,
    );
    expect(provider.pushes).toHaveLength(3);

    // Every turn so far reached the container with its skill and identity mounts.
    expect(runner.calls.map((call) => JSON.parse(call.input).skill)).toEqual([
      'propose',
      'propose',
      'apply',
    ]);
    const args = runner.calls[0]?.args ?? [];
    expect(args).toContain(`${sandbox.store}:${sandbox.store}`);
    expect(args).toContain('/app/dist:/opt/runner/dist:ro');
    expect(args).toContain('GIT_AUTHOR_NAME=OpenSpec Agent');
    expect(args).toContain('openspec-environment-node:latest');

    // The container's usage reached the host and shows up on the turn comment.
    const turnComment = provider.commentLog.find((entry) =>
      entry.body.includes('OpenSpec propose turn'),
    );
    expect(turnComment?.body).toContain('**Usage:** model `container/model`');
    expect(parseUsageMarker(turnComment?.body ?? '')).toMatchObject({ model: 'container/model' });

    // 4. Merge completes the workflow.
    provider.setPullRequestState(100, 'merged');
    await poller.pollOnce();
    expect(await labelsOf(provider, 100)).toContain(DEFAULT_LABELS.done);
  });
});
