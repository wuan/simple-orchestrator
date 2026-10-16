import { describe, expect, it } from 'vitest';

import { DEFAULT_LABELS } from '../config/types.js';
import type { TurnResult } from '../domain/types.js';
import { FakeProvider } from '../provider/fake/fake-provider.js';
import type { ProviderIssue, ProviderPullRequest } from '../provider/types.js';
import { FakeRuntime } from '../runtime/fake/fake-runtime.js';
import { LimitExceededError } from '../runtime/limits.js';
import type { AgentRuntime, TurnRequest } from '../runtime/types.js';
import { WorkflowEngine } from './engine.js';
import { FakeOpenspecCli } from './testing/fake-openspec.js';
import { FakeSandbox } from './testing/fake-sandbox.js';

function proposeResult(overrides: Partial<TurnResult> = {}): TurnResult {
  return {
    skill: 'propose',
    commits: ['c1'],
    summary: 'proposed the change',
    questions: [],
    needsInput: false,
    agentClaimsReady: false,
    ...overrides,
  };
}

function applyResult(overrides: Partial<TurnResult> = {}): TurnResult {
  return {
    skill: 'apply',
    commits: ['c2'],
    summary: 'implemented and archived',
    questions: [],
    needsInput: false,
    agentClaimsReady: true,
    ...overrides,
  };
}

class ScriptedRuntime implements AgentRuntime {
  readonly id = 'scripted';
  calls = 0;
  constructor(private readonly behavior: (call: number) => Promise<TurnResult>) {}
  async run(_request: TurnRequest): Promise<TurnResult> {
    this.calls += 1;
    return this.behavior(this.calls);
  }
}

interface Harness {
  provider: FakeProvider;
  runtime: FakeRuntime;
  engine: WorkflowEngine;
  openspec: FakeOpenspecCli;
}

function harness(
  options: {
    ready?: boolean;
    maxReviseRounds?: number;
    runtime?: AgentRuntime;
    provider?: FakeProvider;
  } = {},
): Harness {
  const provider = options.provider ?? new FakeProvider();
  const runtime = new FakeRuntime();
  const openspec = new FakeOpenspecCli();
  if (options.ready === true) openspec.markReady('add-x');
  else openspec.markInProgress('add-x');

  const engine = new WorkflowEngine({
    provider,
    runtime: options.runtime ?? runtime,
    sandbox: new FakeSandbox(),
    openspec,
    labels: DEFAULT_LABELS,
    baseBranch: 'main',
    maxReviseRounds: options.maxReviseRounds ?? 3,
  });
  return { provider, runtime, engine, openspec };
}

async function seedIssue(
  provider: FakeProvider,
  number = 1,
  labels: string[] = ['openspec'],
): Promise<ProviderIssue> {
  provider.seedIssue({ number, labels });
  const issue = await provider.getIssue({ repo: provider.repo, number });
  if (issue === null) throw new Error('issue not seeded');
  return issue;
}

async function labelsOf(provider: FakeProvider, number: number): Promise<string[]> {
  return (await provider.getPullRequest({ repo: provider.repo, number }))?.labels ?? [];
}

describe('WorkflowEngine.start', () => {
  it('starts a workflow and runs the first propose turn', async () => {
    const { provider, runtime, engine } = harness();
    const issue = await seedIssue(provider);
    runtime.enqueue(proposeResult());

    const result = await engine.start(issue);
    expect(result.started).toBe(true);
    expect(result.pullRequest?.branch).toBe('openspec/issue-1');
    expect(result.pullRequest?.draft).toBe(true);
    expect(await labelsOf(provider, result.pullRequest?.ref.number ?? -1)).toContain(
      DEFAULT_LABELS.proposing,
    );
    expect(runtime.requests[0]?.context.skill).toBe('propose');
    expect(provider.commentLog.some((c) => c.body.includes('OpenSpec propose turn'))).toBe(true);
  });

  it('does not create a second pull request for the same issue', async () => {
    const { provider, runtime, engine } = harness();
    const issue = await seedIssue(provider);
    runtime.enqueue(proposeResult());
    await engine.start(issue);
    const second = await engine.start(issue);

    expect(second.started).toBe(false);
    expect(await provider.listPullRequestsForIssue(issue.ref)).toHaveLength(1);
    expect(runtime.requests).toHaveLength(1);
  });

  it('sets READY from the predicate even when the agent does not claim readiness', async () => {
    const { provider, runtime, engine } = harness({ ready: true });
    const issue = await seedIssue(provider);
    runtime.enqueue(proposeResult({ agentClaimsReady: false }));

    const result = await engine.start(issue);
    expect(await labelsOf(provider, result.pullRequest?.ref.number ?? -1)).toContain(
      DEFAULT_LABELS.ready,
    );
  });

  it('ignores an agent readiness claim when the predicate fails', async () => {
    const { provider, runtime, engine } = harness({ ready: false });
    const issue = await seedIssue(provider);
    runtime.enqueue(proposeResult({ agentClaimsReady: true }));

    const result = await engine.start(issue);
    expect(await labelsOf(provider, result.pullRequest?.ref.number ?? -1)).toContain(
      DEFAULT_LABELS.proposing,
    );
  });
});

describe('WorkflowEngine.drive', () => {
  async function started(options: Parameters<typeof harness>[0] = {}): Promise<{
    harness: Harness;
    issue: ProviderIssue;
    pullRequestNumber: number;
  }> {
    const h = harness(options);
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());
    const result = await h.engine.start(issue);
    return { harness: h, issue, pullRequestNumber: result.pullRequest?.ref.number ?? -1 };
  }

  it('is idle when there is no new human activity', async () => {
    const { harness: h, pullRequestNumber } = await started();
    const pr = await h.provider.getPullRequest({
      repo: h.provider.repo,
      number: pullRequestNumber,
    });
    const action = await h.engine.drive(pr!);
    expect(action.kind).toBe('idle');
    expect(h.runtime.requests).toHaveLength(1);
  });

  it('runs a revise turn for new reviewer feedback', async () => {
    const { harness: h, pullRequestNumber } = await started();
    h.provider.seedReview(pullRequestNumber, { state: 'changes_requested', body: 'fix X' });
    h.runtime.enqueue(proposeResult({ summary: 'revised' }));

    const pr = await h.provider.getPullRequest({
      repo: h.provider.repo,
      number: pullRequestNumber,
    });
    const action = await h.engine.drive(pr!);
    expect(action.kind).toBe('revise');
    expect(h.runtime.requests).toHaveLength(2);
    expect(h.runtime.requests[1]?.context.pendingFeedback).toHaveLength(1);
  });

  it('fails once the revise limit is reached', async () => {
    const { harness: h, pullRequestNumber } = await started({ maxReviseRounds: 0 });
    h.provider.seedReview(pullRequestNumber, { state: 'changes_requested' });

    const pr = await h.provider.getPullRequest({
      repo: h.provider.repo,
      number: pullRequestNumber,
    });
    const action = await h.engine.drive(pr!);
    expect(action.kind).toBe('fail');
    expect(await labelsOf(h.provider, pullRequestNumber)).toContain(DEFAULT_LABELS.failed);
  });

  it('applies an approved ready change once, and the claim prevents a re-apply', async () => {
    const { harness: h, pullRequestNumber } = await started({ ready: true });
    h.provider.seedReview(pullRequestNumber, { state: 'approved', body: 'lgtm' });
    h.runtime.enqueue(applyResult());

    const first = await h.engine.drive(
      (await h.provider.getPullRequest({ repo: h.provider.repo, number: pullRequestNumber }))!,
    );
    expect(first.kind).toBe('apply');
    expect(await labelsOf(h.provider, pullRequestNumber)).toContain(DEFAULT_LABELS.implementing);
    expect(h.runtime.requests.filter((r) => r.context.skill === 'apply')).toHaveLength(1);

    const second = await h.engine.drive(
      (await h.provider.getPullRequest({ repo: h.provider.repo, number: pullRequestNumber }))!,
    );
    expect(second.kind).toBe('idle');
    expect(h.runtime.requests.filter((r) => r.context.skill === 'apply')).toHaveLength(1);
  });

  it('drives a revise turn when an approval arrives before the change is ready', async () => {
    const { harness: h, pullRequestNumber } = await started({ ready: false });
    h.provider.seedReview(pullRequestNumber, { state: 'approved' });
    h.runtime.enqueue(proposeResult());

    const action = await h.engine.drive(
      (await h.provider.getPullRequest({ repo: h.provider.repo, number: pullRequestNumber }))!,
    );
    expect(action.kind).toBe('revise');
  });

  it('finishes a merged pull request', async () => {
    const h = harness();
    await seedIssue(h.provider, 1);
    h.provider.seedPullRequest({
      number: 100,
      branch: 'openspec/issue-1',
      state: 'merged',
      labels: [DEFAULT_LABELS.implementing],
      linkedIssue: 1,
    });

    const action = await h.engine.drive(
      (await h.provider.getPullRequest({ repo: h.provider.repo, number: 100 }))!,
    );
    expect(action.kind).toBe('finish');
    expect(await labelsOf(h.provider, 100)).toContain(DEFAULT_LABELS.done);
  });

  it('cancels when the trigger label is removed', async () => {
    const h = harness();
    await seedIssue(h.provider, 1, []);
    h.provider.seedPullRequest({
      number: 100,
      branch: 'openspec/issue-1',
      labels: [DEFAULT_LABELS.proposing],
      linkedIssue: 1,
    });

    const action = await h.engine.drive(
      (await h.provider.getPullRequest({ repo: h.provider.repo, number: 100 }))!,
    );
    expect(action.kind).toBe('cancel');
    expect(await labelsOf(h.provider, 100)).not.toContain(DEFAULT_LABELS.proposing);
  });
});

describe('WorkflowEngine failure handling', () => {
  it('retries a transient failure once and succeeds', async () => {
    const scripted = new ScriptedRuntime(async (call) => {
      if (call === 1) throw new Error('transient');
      return proposeResult();
    });
    const h = harness({ runtime: scripted });
    const issue = await seedIssue(h.provider);

    await h.engine.start(issue);
    expect(scripted.calls).toBe(2);
    expect(await labelsOf(h.provider, 100)).toContain(DEFAULT_LABELS.proposing);
  });

  it('fails permanently after the retry also fails', async () => {
    const scripted = new ScriptedRuntime(async () => {
      throw new Error('boom');
    });
    const h = harness({ runtime: scripted });
    const issue = await seedIssue(h.provider);

    await h.engine.start(issue);
    expect(scripted.calls).toBe(2);
    expect(await labelsOf(h.provider, 100)).toContain(DEFAULT_LABELS.failed);
    expect(h.provider.commentLog.some((c) => c.body.includes('Workflow failed'))).toBe(true);
  });

  it('does not retry a limit failure', async () => {
    const scripted = new ScriptedRuntime(async () => {
      throw new LimitExceededError('steps');
    });
    const h = harness({ runtime: scripted });
    const issue = await seedIssue(h.provider);

    await h.engine.start(issue);
    expect(scripted.calls).toBe(1);
    expect(await labelsOf(h.provider, 100)).toContain(DEFAULT_LABELS.failed);
  });
});

describe('WorkflowEngine.recover', () => {
  async function failedPullRequest(h: Harness): Promise<ProviderPullRequest> {
    await seedIssue(h.provider, 1);
    h.provider.seedPullRequest({
      number: 100,
      branch: 'openspec/issue-1',
      labels: [DEFAULT_LABELS.failed],
      linkedIssue: 1,
    });
    const pullRequest = await h.provider.getPullRequest({ repo: h.provider.repo, number: 100 });
    if (pullRequest === null) throw new Error('pull request not seeded');
    return pullRequest;
  }

  it('re-runs the propose turn for a failed pull request', async () => {
    const h = harness();
    const pullRequest = await failedPullRequest(h);
    h.runtime.enqueue(proposeResult());

    const recovered = await h.engine.recover(pullRequest);

    expect(recovered).toBe(true);
    expect(h.runtime.requests).toHaveLength(1);
    expect(h.runtime.requests[0]?.context.skill).toBe('propose');
    expect(await labelsOf(h.provider, 100)).toContain(DEFAULT_LABELS.proposing);
    expect(await labelsOf(h.provider, 100)).not.toContain(DEFAULT_LABELS.failed);
  });

  it('attempts recovery at most once per process', async () => {
    const h = harness();
    const pullRequest = await failedPullRequest(h);
    h.runtime.enqueue(proposeResult());

    expect(await h.engine.recover(pullRequest)).toBe(true);
    expect(await h.engine.recover(pullRequest)).toBe(false);
    expect(h.runtime.requests).toHaveLength(1);
  });

  it('signals failure and stays recoverable when the turn fails again', async () => {
    const scripted = new ScriptedRuntime(async () => {
      throw new Error('still broken');
    });
    const h = harness({ runtime: scripted });
    const pullRequest = await failedPullRequest(h);

    await h.engine.recover(pullRequest);

    expect(await labelsOf(h.provider, 100)).toContain(DEFAULT_LABELS.failed);
    expect(h.provider.commentLog.some((c) => c.body.includes('Workflow failed'))).toBe(true);
  });
});

describe('WorkflowEngine turn publishing', () => {
  class PushFailingProvider extends FakeProvider {
    override async push(): Promise<void> {
      throw new Error('push rejected');
    }
  }

  it('pushes the workflow branch after a successful turn', async () => {
    const h = harness();
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());

    await h.engine.start(issue);

    expect(h.provider.pushes).toHaveLength(1);
    expect(h.provider.pushes[0]?.branch).toBe('openspec/issue-1');
    expect(h.provider.pushes[0]?.destination).toContain('openspec-issue-1');
  });

  it('marks the workflow failed when the push fails', async () => {
    const h = harness({ provider: new PushFailingProvider() });
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());

    await h.engine.start(issue);

    expect(await labelsOf(h.provider, 100)).toContain(DEFAULT_LABELS.failed);
    expect(h.provider.commentLog.some((c) => c.body.includes('push rejected'))).toBe(true);
  });
});
