import { describe, expect, it } from 'vitest';

import { DEFAULT_LABELS, type EnvironmentSpec } from '../config/types.js';
import type { TurnResult, TurnUsage } from '../domain/types.js';
import { FakeProvider } from '../provider/fake/fake-provider.js';
import type { ProviderIssue, ProviderPullRequest } from '../provider/types.js';
import { FakeRuntime } from '../runtime/fake/fake-runtime.js';
import { LimitExceededError } from '../runtime/limits.js';
import type { AgentRuntime, TurnRequest } from '../runtime/types.js';
import { WorkflowEngine } from './engine.js';
import { FakeOpenspecCli } from './testing/fake-openspec.js';
import { FakeSandbox } from './testing/fake-sandbox.js';
import { parseUsageMarker } from './usage.js';

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
  sandbox: FakeSandbox;
  messages: string[];
}

function harness(
  options: {
    ready?: boolean;
    maxReviseRounds?: number;
    runtime?: AgentRuntime;
    logger?: (message: string) => void;
    provider?: FakeProvider;
    sandbox?: FakeSandbox;
    environment?: EnvironmentSpec;
  } = {},
): Harness {
  const provider = options.provider ?? new FakeProvider();
  const runtime = new FakeRuntime();
  const openspec = new FakeOpenspecCli();
  if (options.ready === true) openspec.markReady('add-x');
  else openspec.markInProgress('add-x');

  const sandbox = options.sandbox ?? new FakeSandbox();
  const messages: string[] = [];
  const logger = options.logger ?? ((message: string) => void messages.push(message));
  const engine = new WorkflowEngine({
    provider,
    runtime: options.runtime ?? runtime,
    sandbox,
    openspec,
    labels: DEFAULT_LABELS,
    baseBranch: 'main',
    ...(options.environment === undefined ? {} : { environment: options.environment }),
    maxReviseRounds: options.maxReviseRounds ?? 3,
    logger,
  });
  return { provider, runtime, engine, openspec, sandbox, messages };
}

async function seedIssue(
  provider: FakeProvider,
  number = 1,
  labels: string[] = ['openspec'],
  title?: string,
): Promise<ProviderIssue> {
  provider.seedIssue({ number, labels, title });
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

  it('titles the created pull request with a deduced Conventional Commit subject', async () => {
    const { provider, runtime, engine } = harness();
    const issue = await seedIssue(provider, 7, ['openspec'], 'Improve PR generation');
    runtime.enqueue(proposeResult());

    const result = await engine.start(issue);

    expect(result.pullRequest?.title).toBe('feat: Improve PR generation');
    expect(result.pullRequest?.title).not.toContain('OpenSpec change for issue #7');
    // A non-conventional issue title carries no scope.
    expect(result.pullRequest?.title).not.toContain('(');
  });

  it('deduces the type from the issue labels', async () => {
    const { provider, runtime, engine } = harness();
    const issue = await seedIssue(provider, 7, ['openspec', 'bug'], 'Handle a crash');
    runtime.enqueue(proposeResult());

    const result = await engine.start(issue);

    expect(result.pullRequest?.title).toBe('fix: Handle a crash');
  });

  it('preserves a conventional issue title, including its scope', async () => {
    const { provider, runtime, engine } = harness();
    const issue = await seedIssue(provider, 7, ['openspec'], 'docs(api): update the reference');
    runtime.enqueue(proposeResult());

    const result = await engine.start(issue);

    expect(result.pullRequest?.title).toBe('docs(api): update the reference');
  });

  it('compacts a long issue title within the commit-subject limit', async () => {
    const { provider, runtime, engine } = harness();
    const issue = await seedIssue(
      provider,
      7,
      ['openspec'],
      'Allow to extract default values from the configuration to avoid repeating information',
    );
    runtime.enqueue(proposeResult());

    const result = await engine.start(issue);

    const title = result.pullRequest?.title ?? '';
    expect(title.startsWith('feat: ')).toBe(true);
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThan(72);
  });

  it('references only the started issue, once, in the created pull request body', async () => {
    const { provider, runtime, engine } = harness();
    const issue = await seedIssue(provider, 7);
    runtime.enqueue(proposeResult());

    const result = await engine.start(issue);
    const body = result.pullRequest?.body ?? '';

    expect(body).toBe('Closes #7');
    expect(body.match(/Closes #\d+/g)).toEqual(['Closes #7']);
    expect(body).not.toContain('Workflow for issue #7.');
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

  it('does not start a workflow resolved by a merged pull request', async () => {
    const { provider, runtime, engine } = harness();
    const issue = await seedIssue(provider);
    provider.seedPullRequest({
      number: 100,
      branch: 'openspec/issue-1',
      linkedIssue: 1,
      state: 'merged',
    });

    const result = await engine.start(issue);

    expect(result.started).toBe(false);
    expect(result.resolvedBy?.ref.number).toBe(100);
    expect(await provider.listPullRequestsForIssue(issue.ref)).toHaveLength(1);
    expect(runtime.requests).toHaveLength(0);
  });

  it('starts a workflow when the only pull request was closed without merge', async () => {
    const { provider, runtime, engine } = harness();
    const issue = await seedIssue(provider);
    provider.seedPullRequest({
      number: 50,
      branch: 'openspec/issue-1',
      linkedIssue: 1,
      state: 'closed',
    });
    runtime.enqueue(proposeResult());

    const result = await engine.start(issue);

    expect(result.started).toBe(true);
    expect(await provider.listPullRequestsForIssue(issue.ref)).toHaveLength(2);
    expect(runtime.requests).toHaveLength(1);
  });

  it('cancels instead of starting when a closed pull request is still in flight', async () => {
    const { provider, runtime, engine } = harness();
    const issue = await seedIssue(provider);
    provider.seedPullRequest({
      number: 50,
      branch: 'openspec/issue-1',
      linkedIssue: 1,
      state: 'closed',
      labels: [DEFAULT_LABELS.ready],
    });

    const result = await engine.start(issue);

    expect(result.started).toBe(false);
    expect(result.cancelled?.ref.number).toBe(50);
    expect(await labelsOf(provider, 50)).toEqual([]);
    expect((await provider.getIssue(issue.ref))?.labels).not.toContain('openspec');
    expect(await provider.listPullRequestsForIssue(issue.ref)).toHaveLength(1);
    expect(runtime.requests).toHaveLength(0);
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

  it('requires a new approval when an early approval made the change ready', async () => {
    const { harness: h, pullRequestNumber } = await started({ ready: false });
    const current = async (): Promise<ProviderPullRequest> =>
      (await h.provider.getPullRequest({ repo: h.provider.repo, number: pullRequestNumber }))!;

    // Approved while still proposing: answered by a propose turn that makes it ready.
    h.provider.seedReview(pullRequestNumber, { state: 'approved', body: 'early' });
    h.openspec.markReady('add-x');
    h.runtime.enqueue(proposeResult());
    expect((await h.engine.drive(await current())).kind).toBe('revise');
    expect(await labelsOf(h.provider, pullRequestNumber)).toContain(DEFAULT_LABELS.ready);

    // The early approval does not carry over to the ready change.
    expect((await h.engine.drive(await current())).kind).toBe('idle');
    expect(h.runtime.requests.filter((r) => r.context.skill === 'apply')).toHaveLength(0);

    h.provider.seedReview(pullRequestNumber, { state: 'approved', body: 'lgtm' });
    h.runtime.enqueue(applyResult());
    expect((await h.engine.drive(await current())).kind).toBe('apply');
  });

  it('removes the trigger label when the pull request is closed without merge', async () => {
    const { harness: h, issue, pullRequestNumber } = await started();
    h.provider.setPullRequestState(pullRequestNumber, 'closed');

    const action = await h.engine.drive(
      (await h.provider.getPullRequest({ repo: h.provider.repo, number: pullRequestNumber }))!,
    );

    expect(action.kind).toBe('cancel');
    expect(await labelsOf(h.provider, pullRequestNumber)).toEqual([]);
    expect((await h.provider.getIssue(issue.ref))?.labels).not.toContain('openspec');
  });

  it('keeps the issue labels when the trigger label was removed', async () => {
    const { harness: h, issue, pullRequestNumber } = await started();
    await h.provider.removeLabel({ kind: 'issue', ref: issue.ref }, 'openspec');

    const action = await h.engine.drive(
      (await h.provider.getPullRequest({ repo: h.provider.repo, number: pullRequestNumber }))!,
    );

    expect(action.kind).toBe('cancel');
    const comment = h.provider.commentLog.at(-1)?.body ?? '';
    expect(comment).toContain('Workflow cancelled: trigger label removed from the issue.');
    expect(comment).not.toContain('add it again');
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

describe('WorkflowEngine verbose diagnostics', () => {
  it('reports an idle decision and its reason', async () => {
    const h = harness();
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());
    const started = await h.engine.start(issue);
    h.messages.length = 0;

    const pr = await h.provider.getPullRequest({
      repo: h.provider.repo,
      number: started.pullRequest?.ref.number ?? -1,
    });
    await h.engine.drive(pr!);

    expect(h.messages.join('\n')).toContain('decision idle (no new human activity)');
  });

  it('reports an action decision and its reason', async () => {
    const h = harness();
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());
    const started = await h.engine.start(issue);
    const number = started.pullRequest?.ref.number ?? -1;
    h.provider.seedReview(number, { state: 'changes_requested', body: 'fix X' });
    h.runtime.enqueue(proposeResult({ summary: 'revised' }));
    h.messages.length = 0;

    await h.engine.drive((await h.provider.getPullRequest({ repo: h.provider.repo, number }))!);

    expect(h.messages.join('\n')).toContain('decision revise (new reviewer feedback)');
  });

  it('reports a successful propose turn and its readiness result', async () => {
    const h = harness({ ready: true });
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());
    h.messages.length = 0;

    await h.engine.start(issue);

    const log = h.messages.join('\n');
    expect(log).toContain('starting propose turn (branch openspec/issue-1)');
    expect(log).toContain('succeeded with commits c1');
    expect(log).toContain('readiness ready (change is complete and valid)');
  });

  it('reports a successful apply turn', async () => {
    const h = harness({ ready: true });
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());
    const started = await h.engine.start(issue);
    const number = started.pullRequest?.ref.number ?? -1;
    h.provider.seedReview(number, { state: 'approved', body: 'lgtm' });
    h.runtime.enqueue(applyResult({ commits: ['code-commit', 'archive-commit'] }));
    h.messages.length = 0;

    await h.engine.drive((await h.provider.getPullRequest({ repo: h.provider.repo, number }))!);

    const log = h.messages.join('\n');
    expect(log).toContain('starting apply turn (branch openspec/issue-1)');
    expect(log).toContain('succeeded with commits code-commit, archive-commit');
  });

  it('reports a failing turn and the workflow failure', async () => {
    const scripted = new ScriptedRuntime(async () => {
      throw new Error('boom');
    });
    const h = harness({ runtime: scripted });
    const issue = await seedIssue(h.provider);
    h.messages.length = 0;

    await h.engine.start(issue);

    const log = h.messages.join('\n');
    expect(log).toContain('propose turn failed: boom');
    expect(log).toContain('failed: boom');
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
    expect(h.messages.join('\n')).toContain(
      'propose turn: retrying after transient failure: transient',
    );
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

describe('WorkflowEngine stalled propose turns', () => {
  it('fails a propose turn that commits nothing', async () => {
    const h = harness();
    h.sandbox.headResults = ['same', 'same'];
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());

    await h.engine.start(issue);

    expect(await labelsOf(h.provider, 100)).toContain(DEFAULT_LABELS.failed);
    expect(h.provider.pushes).toHaveLength(0);
    expect(h.provider.commentLog.some((c) => c.body.includes('produced no change'))).toBe(true);
    expect(h.messages.join('\n')).toContain(
      'the workflow branch tip is unchanged; treating the turn as failed',
    );
  });

  it('advances when the turn commits to the branch', async () => {
    const h = harness();
    h.sandbox.headResults = ['before', 'after'];
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());

    await h.engine.start(issue);

    expect(await labelsOf(h.provider, 100)).toContain(DEFAULT_LABELS.proposing);
    expect(await labelsOf(h.provider, 100)).not.toContain(DEFAULT_LABELS.failed);
  });

  it('does not count the base-integration merge as the turn making progress', async () => {
    const h = harness();
    // The base merge is committed while provisioning, so the tip is unchanged
    // across the turn window when the turn itself commits nothing.
    h.sandbox.baseIntegrationResults = [false, true];
    h.sandbox.headResults = ['same', 'same'];
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());

    await h.engine.start(issue);

    expect(await labelsOf(h.provider, 100)).toContain(DEFAULT_LABELS.failed);
  });

  it('does not fail a review-driven revise turn that commits nothing', async () => {
    const h = harness();
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());
    const started = await h.engine.start(issue);
    const number = started.pullRequest?.ref.number ?? -1;

    h.provider.seedReview(number, { state: 'changes_requested', body: 'nothing to change' });
    h.sandbox.headResults = ['same', 'same'];
    h.runtime.enqueue(proposeResult({ summary: 'no change needed' }));

    const action = await h.engine.drive(
      (await h.provider.getPullRequest({ repo: h.provider.repo, number }))!,
    );

    expect(action.kind).toBe('revise');
    expect(await labelsOf(h.provider, number)).not.toContain(DEFAULT_LABELS.failed);
    expect(await labelsOf(h.provider, number)).toContain(DEFAULT_LABELS.proposing);
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

describe('WorkflowEngine.recoverStalled', () => {
  async function proposingPullRequest(h: Harness): Promise<ProviderPullRequest> {
    await seedIssue(h.provider, 1);
    h.provider.seedPullRequest({
      number: 100,
      branch: 'openspec/issue-1',
      labels: [DEFAULT_LABELS.proposing],
      linkedIssue: 1,
    });
    const pullRequest = await h.provider.getPullRequest({ repo: h.provider.repo, number: 100 });
    if (pullRequest === null) throw new Error('pull request not seeded');
    return pullRequest;
  }

  it('re-runs the propose turn when a proposing branch carries no proposal', async () => {
    const h = harness();
    const pullRequest = await proposingPullRequest(h);
    h.sandbox.hasChangesResults = [false];
    h.runtime.enqueue(proposeResult());

    const recovered = await h.engine.recoverStalled(pullRequest);

    expect(recovered).toBe(true);
    expect(h.runtime.requests).toHaveLength(1);
    expect(h.runtime.requests[0]?.context.skill).toBe('propose');
  });

  it('fails the workflow and reports when the recovery turn still commits nothing', async () => {
    const h = harness();
    const pullRequest = await proposingPullRequest(h);
    h.sandbox.hasChangesResults = [false];
    h.sandbox.headResults = ['same', 'same'];
    h.runtime.enqueue(proposeResult());

    const recovered = await h.engine.recoverStalled(pullRequest);

    expect(recovered).toBe(true);
    expect(await labelsOf(h.provider, 100)).toContain(DEFAULT_LABELS.failed);
    expect(h.provider.commentLog.some((c) => c.body.includes('produced no change'))).toBe(true);
  });

  it('leaves a proposing branch that already carries a proposal to review', async () => {
    const h = harness();
    const pullRequest = await proposingPullRequest(h);
    h.sandbox.hasChangesResults = [true];

    const recovered = await h.engine.recoverStalled(pullRequest);

    expect(recovered).toBe(false);
    expect(h.runtime.requests).toHaveLength(0);
    expect(h.messages.join('\n')).toContain('branch carries a proposal');
  });

  it('treats an unresolved base merge as stalled', async () => {
    const h = harness();
    const pullRequest = await proposingPullRequest(h);
    h.sandbox.baseIntegrationResults = [false];
    h.sandbox.hasChangesResults = [true];
    h.runtime.enqueue(proposeResult());

    const recovered = await h.engine.recoverStalled(pullRequest);

    expect(recovered).toBe(true);
    expect(h.runtime.requests).toHaveLength(1);
  });

  it('attempts stalled recovery at most once per process', async () => {
    const h = harness();
    const pullRequest = await proposingPullRequest(h);
    h.sandbox.hasChangesResults = [false];
    h.runtime.enqueue(proposeResult());

    expect(await h.engine.recoverStalled(pullRequest)).toBe(true);
    expect(await h.engine.recoverStalled(pullRequest)).toBe(false);
    expect(h.runtime.requests).toHaveLength(1);
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

describe('WorkflowEngine release after apply', () => {
  async function startedReady(): Promise<{ h: Harness; number: number }> {
    const h = harness({ ready: true });
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());
    const started = await h.engine.start(issue);
    return { h, number: started.pullRequest?.ref.number ?? -1 };
  }

  it('marks the draft pull request ready after a successful apply', async () => {
    const { h, number } = await startedReady();
    expect((await h.provider.getPullRequest({ repo: h.provider.repo, number }))?.draft).toBe(true);

    h.provider.seedReview(number, { state: 'approved', body: 'lgtm' });
    h.runtime.enqueue(applyResult());

    const action = await h.engine.drive(
      (await h.provider.getPullRequest({ repo: h.provider.repo, number }))!,
    );

    expect(action.kind).toBe('apply');
    expect((await h.provider.getPullRequest({ repo: h.provider.repo, number }))?.draft).toBe(false);
    expect(await labelsOf(h.provider, number)).toContain(DEFAULT_LABELS.implementing);
    expect(await labelsOf(h.provider, number)).not.toContain(DEFAULT_LABELS.failed);
  });

  it('fails the workflow when the pull request cannot be released from draft', async () => {
    class MarkReadyFailingProvider extends FakeProvider {
      override async markPullRequestReady(): Promise<void> {
        throw new Error('insufficient permissions');
      }
    }
    const h = harness({ ready: true, provider: new MarkReadyFailingProvider() });
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());
    const started = await h.engine.start(issue);
    const number = started.pullRequest?.ref.number ?? -1;

    h.provider.seedReview(number, { state: 'approved', body: 'lgtm' });
    h.runtime.enqueue(applyResult());

    await h.engine.drive((await h.provider.getPullRequest({ repo: h.provider.repo, number }))!);

    expect(await labelsOf(h.provider, number)).toContain(DEFAULT_LABELS.failed);
    expect(h.provider.commentLog.some((c) => c.body.includes('insufficient permissions'))).toBe(
      true,
    );
  });
});

describe('WorkflowEngine base integration', () => {
  it('flags a pending base integration on the turn context', async () => {
    const h = harness();
    // Pending before the turn, integrated after it.
    h.sandbox.baseIntegrationResults = [false, true];
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());

    await h.engine.start(issue);

    expect(h.runtime.requests[0]?.context.pendingBaseIntegration).toBe(true);
    expect(h.provider.pushes).toHaveLength(1);
  });

  it('does not flag a pending base integration when the base is already merged', async () => {
    const { provider, runtime, engine } = harness();
    const issue = await seedIssue(provider);
    runtime.enqueue(proposeResult());

    await engine.start(issue);

    expect(runtime.requests[0]?.context.pendingBaseIntegration).toBe(false);
  });

  it('fails the workflow without pushing when the base is left unintegrated', async () => {
    const h = harness();
    // Pending before the turn and still unresolved after it.
    h.sandbox.baseIntegrationResults = [false, false];
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());

    await h.engine.start(issue);

    expect(await labelsOf(h.provider, 100)).toContain(DEFAULT_LABELS.failed);
    expect(h.provider.pushes).toHaveLength(0);
    expect(
      h.provider.commentLog.some((c) => c.body.includes("base branch 'main' was not integrated")),
    ).toBe(true);
  });
});

describe('WorkflowEngine container environment', () => {
  it("carries the repository's environment and store on the turn request", async () => {
    const environment: EnvironmentSpec = { image: 'ghcr.io/acme/agent-java:latest' };
    const h = harness({ environment });
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());

    await h.engine.start(issue);

    expect(h.runtime.requests[0]?.environment).toEqual(environment);
    expect(h.runtime.requests[0]?.store).toBe('/tmp/fake-store');
  });

  it('leaves the environment undefined when the repository configures none', async () => {
    const h = harness();
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());

    await h.engine.start(issue);

    expect(h.runtime.requests[0]?.environment).toBeUndefined();
  });
});

function commentContaining(provider: FakeProvider, needle: string): string {
  const body = provider.commentLog.map((entry) => entry.body).find((text) => text.includes(needle));
  if (body === undefined) throw new Error(`no comment contains ${needle}`);
  return body;
}

/** A runtime that streams usage and then throws (or fails transiently first). */
class UsageRuntime implements AgentRuntime {
  readonly id = 'usage';
  calls = 0;

  constructor(
    private readonly usage: Partial<TurnUsage>,
    private readonly behavior: (call: number) => void = () => {},
  ) {}

  async run(request: TurnRequest): Promise<TurnResult> {
    this.calls += 1;
    request.onUsage?.(this.usage);
    this.behavior(this.calls);
    return proposeResult({ usage: { ...this.usage } });
  }
}

describe('WorkflowEngine turn metrics', () => {
  it('reports the model, tokens, elapsed time, and attempts on a propose turn', async () => {
    const h = harness();
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());

    await h.engine.start(issue);

    const comment = commentContaining(h.provider, 'OpenSpec propose turn');
    expect(comment).toContain('**Usage:** model `fake/model`');
    expect(comment).toContain(
      'tokens 20 (input 10 · output 5 · reasoning 2 · cache read 2 · cache write 1)',
    );
    expect(comment).toMatch(/elapsed \d+(ms|s)/);
    expect(comment).toContain('attempts 1');
    expect(parseUsageMarker(comment)).toMatchObject({ model: 'fake/model', tokens: 20 });
  });

  it('reports metrics on an apply turn', async () => {
    const h = harness({ ready: true });
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());
    const started = await h.engine.start(issue);
    const number = started.pullRequest?.ref.number ?? -1;
    h.provider.seedReview(number, { state: 'approved', body: 'lgtm' });
    h.runtime.enqueue(applyResult());

    await h.engine.drive((await h.provider.getPullRequest({ repo: h.provider.repo, number }))!);

    const comment = commentContaining(h.provider, 'OpenSpec apply turn');
    expect(comment).toContain('**Usage:** model `fake/model`');
    expect(comment).toContain('attempts 1');
  });

  it('carries the same metrics on the readiness prompt as on the turn comment', async () => {
    const h = harness({ ready: true });
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());

    await h.engine.start(issue);

    const turn = commentContaining(h.provider, 'OpenSpec propose turn');
    const readiness = commentContaining(h.provider, 'The change is ready for development');
    const line = turn.split('\n').find((text) => text.startsWith('**Usage:**'));
    expect(line).toBeDefined();
    expect(readiness).toContain(line ?? '');
    expect(parseUsageMarker(readiness)).toMatchObject({ model: 'fake/model', tokens: 20 });
  });

  it('reports elapsed time and attempts for a runtime that reports no duration', async () => {
    // The fake's default usage carries no duration; the engine must measure it.
    const h = harness();
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());

    await h.engine.start(issue);

    const comment = commentContaining(h.provider, 'OpenSpec propose turn');
    expect(comment).toMatch(/elapsed \d+(ms|s)/);
    expect(comment).toContain('attempts 1');
  });

  it('reports attempts and usage spanning a transient retry', async () => {
    const runtime = new UsageRuntime({ model: 'retry/model', input: 3, tokens: 3 }, (call) => {
      if (call === 1) throw new Error('transient');
    });
    const h = harness({ runtime });
    const issue = await seedIssue(h.provider);

    await h.engine.start(issue);

    const comment = commentContaining(h.provider, 'OpenSpec propose turn');
    expect(comment).toContain('model `retry/model`');
    expect(comment).toContain('tokens 6 (input 6');
    expect(comment).toContain('attempts 2');
  });

  it('reports partial usage, elapsed time, and attempts for a failed turn', async () => {
    const runtime = new UsageRuntime({ model: 'fail/model', input: 7, tokens: 7 }, () => {
      throw new Error('boom');
    });
    const h = harness({ runtime });
    const issue = await seedIssue(h.provider);

    await h.engine.start(issue);

    const comment = commentContaining(h.provider, 'Workflow failed: boom');
    expect(comment).toContain('model `fail/model`');
    expect(comment).toContain('tokens 14');
    expect(comment).toContain('attempts 2');
    expect(comment).toMatch(/elapsed \d+(ms|s)/);
    expect(await labelsOf(h.provider, 100)).toContain(DEFAULT_LABELS.failed);
  });
});

describe('WorkflowEngine lifecycle metrics', () => {
  it("repeats the last turn's metrics on a merged completion", async () => {
    const h = harness();
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());
    await h.engine.start(issue);
    const number = 100;
    h.provider.setPullRequestState(number, 'merged');

    await h.engine.drive((await h.provider.getPullRequest({ repo: h.provider.repo, number }))!);

    const comment = commentContaining(h.provider, 'Merged. Workflow complete.');
    expect(comment).toContain('**Usage (last turn):** model `fake/model`');
    expect(comment).toContain('tokens 20');
    expect(comment).not.toContain('model unknown');
  });

  it("recovers the last turn's metrics without process state after a restart", async () => {
    const h = harness();
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());
    await h.engine.start(issue);
    h.provider.setPullRequestState(100, 'merged');

    // A fresh engine process holds no memory; the marker in the comments is
    // the only source of the previous turn's metrics.
    const restarted = harness({ provider: h.provider });
    await restarted.engine.drive(
      (await h.provider.getPullRequest({ repo: h.provider.repo, number: 100 }))!,
    );

    const comment = commentContaining(h.provider, 'Merged. Workflow complete.');
    expect(comment).toContain('**Usage (last turn):** model `fake/model`');
    expect(comment).toContain('tokens 20');
  });

  it("repeats the last turn's metrics on cancellation", async () => {
    const h = harness();
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());
    await h.engine.start(issue);
    await h.provider.removeLabel({ kind: 'issue', ref: issue.ref }, 'openspec');

    await h.engine.drive(
      (await h.provider.getPullRequest({ repo: h.provider.repo, number: 100 }))!,
    );

    const comment = commentContaining(h.provider, 'Workflow cancelled');
    expect(comment).toContain('**Usage (last turn):** model `fake/model`');
  });

  it("repeats the last turn's metrics on a revise-limit failure", async () => {
    const h = harness({ maxReviseRounds: 0 });
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());
    await h.engine.start(issue);
    h.provider.seedReview(100, { state: 'changes_requested' });

    await h.engine.drive(
      (await h.provider.getPullRequest({ repo: h.provider.repo, number: 100 }))!,
    );

    const comment = commentContaining(h.provider, 'Workflow failed: revise limit');
    expect(comment).toContain('**Usage (last turn):** model `fake/model`');
  });

  it('states the metrics as unknown when no turn has run', async () => {
    const h = harness();
    await seedIssue(h.provider, 1);
    h.provider.seedPullRequest({
      number: 100,
      branch: 'openspec/issue-1',
      state: 'merged',
      labels: [DEFAULT_LABELS.implementing],
      linkedIssue: 1,
    });

    await h.engine.drive(
      (await h.provider.getPullRequest({ repo: h.provider.repo, number: 100 }))!,
    );

    const comment = commentContaining(h.provider, 'Merged. Workflow complete.');
    expect(comment).toContain('**Usage (last turn):**');
    expect(comment).toContain('model unknown');
    expect(comment).toContain('tokens unknown');
  });
});

/** A fake sandbox whose `commitSubjects()` always fails, as a broken git read would. */
class CommitSubjectsFailingSandbox extends FakeSandbox {
  override async create(input: { branch: string }) {
    const handle = await super.create(input);
    return {
      ...handle,
      commitSubjects: async (): Promise<string[]> => {
        throw new Error('git log failed');
      },
    };
  }
}

describe('WorkflowEngine title reconciliation', () => {
  async function startedReady(
    title: string,
    labels: string[] = ['openspec'],
    provider?: FakeProvider,
    sandbox?: FakeSandbox,
  ): Promise<{ h: Harness; number: number }> {
    const h = harness({
      ready: true,
      ...(provider === undefined ? {} : { provider }),
      ...(sandbox === undefined ? {} : { sandbox }),
    });
    const issue = await seedIssue(h.provider, 1, labels, title);
    h.runtime.enqueue(proposeResult());
    const started = await h.engine.start(issue);
    return { h, number: started.pullRequest?.ref.number ?? -1 };
  }

  /** Approve and run an apply turn whose committed subjects are `subjects`. */
  async function applyOutcome(h: Harness, number: number, subjects: string[]): Promise<string> {
    h.provider.seedReview(number, { state: 'approved', body: 'lgtm' });
    h.sandbox.commitSubjectsResults = [subjects];
    h.runtime.enqueue(applyResult());
    await h.engine.drive((await h.provider.getPullRequest({ repo: h.provider.repo, number }))!);
    return (await h.provider.getPullRequest({ repo: h.provider.repo, number }))?.title ?? '';
  }

  it('changes the type from the applied outcome and keeps the summary', async () => {
    const { h, number } = await startedReady('Add a thing');

    const title = await applyOutcome(h, number, ['fix: correct the crash']);

    expect(title).toBe('fix: Add a thing');
    expect(h.provider.pullRequestUpdates).toHaveLength(1);
    expect(h.provider.pullRequestUpdates[0]?.input.title).toBe('fix: Add a thing');
  });

  it('adds an applied scope to a deduced title that carries none', async () => {
    const { h, number } = await startedReady('Add a thing');

    expect(await applyOutcome(h, number, ['feat(api): add pagination'])).toBe(
      'feat(api): Add a thing',
    );
  });

  it('replaces a deduced scope with the applied one', async () => {
    const { h, number } = await startedReady('feat(web): add pagination');

    expect(await applyOutcome(h, number, ['feat(api): add pagination'])).toBe(
      'feat(api): add pagination',
    );
  });

  it('re-shortens the kept summary within the limit without stacking ellipses', async () => {
    const { h, number } = await startedReady(
      'Allow to extract default values from the configuration to avoid repeating information',
    );

    const title = await applyOutcome(h, number, ['refactor(rollout): rework the reader']);

    expect(title).toBe('refactor(rollout): Allow to extract default values from the…');
    expect(title.length).toBeLessThan(72);
    expect(title.split('…').length - 1).toBe(1);
  });

  it('leaves a deduced title scope-less when the outcome carries no scope', async () => {
    const { h, number } = await startedReady('add pagination');

    expect(await applyOutcome(h, number, ['fix: correct it'])).toBe('fix: add pagination');
  });

  it('keeps a scope deduced from a conventional issue title when the outcome carries none', async () => {
    const { h, number } = await startedReady('feat(web): add pagination');

    expect(await applyOutcome(h, number, ['fix: correct it'])).toBe('fix(web): add pagination');
  });

  it('keeps the deduced scope when the applied subjects disagree on one', async () => {
    const { h, number } = await startedReady('add pagination');

    expect(
      await applyOutcome(h, number, ['feat(api): add pagination', 'feat(web): cover it']),
    ).toBe('feat: add pagination');
    expect(h.provider.pullRequestUpdates).toHaveLength(0);
  });

  it('leaves the deduced title unchanged when the outcome does not agree on a type', async () => {
    const { h, number } = await startedReady('Add a thing');

    expect(await applyOutcome(h, number, ['feat: a', 'fix: b'])).toBe('feat: Add a thing');
    expect(h.provider.pullRequestUpdates).toHaveLength(0);
  });

  it('ignores a prefix whose type is not a project type', async () => {
    const { h, number } = await startedReady('Add a thing');

    expect(await applyOutcome(h, number, ['widget: do a thing'])).toBe('feat: Add a thing');
    expect(h.provider.pullRequestUpdates).toHaveLength(0);
  });

  it("reconciles from the apply turn's own range, so propose commits do not decide it", async () => {
    const h = harness({ ready: true });
    const issue = await seedIssue(h.provider, 1, ['openspec'], 'Add a thing');
    h.sandbox.headResults = ['propose-before', 'propose-after'];
    h.runtime.enqueue(proposeResult());
    const started = await h.engine.start(issue);
    const number = started.pullRequest?.ref.number ?? -1;

    // The apply turn's tip is what the range is read from.
    h.sandbox.headResults = ['apply-tip'];
    const title = await applyOutcome(h, number, ['fix: correct it']);

    expect(h.sandbox.commitSubjectRanges).toEqual(['apply-tip']);
    expect(title).toBe('fix: Add a thing');
  });

  it('ignores an openspec-scoped bookkeeping commit alongside the implementation', async () => {
    const { h, number } = await startedReady('Add a thing');

    expect(
      await applyOutcome(h, number, [
        'chore(openspec): archive the change',
        'feat(api): add pagination',
      ]),
    ).toBe('feat(api): Add a thing');
  });

  it('does not fail the workflow when the title update fails', async () => {
    class TitleUpdateFailingProvider extends FakeProvider {
      override async updatePullRequest(): Promise<void> {
        throw new Error('title update rejected');
      }
    }
    const { h, number } = await startedReady(
      'Add a thing',
      ['openspec'],
      new TitleUpdateFailingProvider(),
    );

    const title = await applyOutcome(h, number, ['fix: correct it']);

    expect(title).toBe('feat: Add a thing');
    expect(await labelsOf(h.provider, number)).toContain(DEFAULT_LABELS.implementing);
    expect(await labelsOf(h.provider, number)).not.toContain(DEFAULT_LABELS.failed);
    expect(h.provider.commentLog.some((c) => c.body.includes('title update rejected'))).toBe(true);
  });

  it('does not fail the workflow when reading the outcome fails', async () => {
    const { h, number } = await startedReady(
      'Add a thing',
      ['openspec'],
      undefined,
      new CommitSubjectsFailingSandbox(),
    );

    expect(await applyOutcome(h, number, ['fix: correct it'])).toBe('feat: Add a thing');
    expect(await labelsOf(h.provider, number)).toContain(DEFAULT_LABELS.implementing);
    expect(await labelsOf(h.provider, number)).not.toContain(DEFAULT_LABELS.failed);
  });
});

/** A provider whose configured bot is a normal account the host does not flag. */
function nonFlaggedBotProvider(): FakeProvider {
  return new FakeProvider({ bot: { login: 'wuan-bot', isBot: false } });
}

describe('WorkflowEngine answered review feedback', () => {
  async function startedWith(h: Harness): Promise<number> {
    const issue = await seedIssue(h.provider);
    h.runtime.enqueue(proposeResult());
    const started = await h.engine.start(issue);
    return started.pullRequest?.ref.number ?? -1;
  }

  async function current(h: Harness, number: number): Promise<ProviderPullRequest> {
    const pr = await h.provider.getPullRequest({ repo: h.provider.repo, number });
    if (pr === null) throw new Error('pull request not found');
    return pr;
  }

  it('does not re-answer feedback when the configured bot is not host-flagged', async () => {
    const h = harness({ provider: nonFlaggedBotProvider() });
    const number = await startedWith(h);

    h.provider.seedReview(number, { state: 'changes_requested', body: 'fix X' });
    h.runtime.enqueue(proposeResult({ summary: 'revised' }));
    const first = await h.engine.drive(await current(h, number));
    expect(first.kind).toBe('revise');

    const second = await h.engine.drive(await current(h, number));
    expect(second.kind).toBe('idle');
    expect(h.runtime.requests.filter((r) => r.context.skill === 'propose')).toHaveLength(2);
  });

  it('leaves an answered review idle and acts on a newer one', async () => {
    const h = harness();
    const number = await startedWith(h);

    // The revise turn reads the review, and its comment records that review as
    // answered, so the next poll leaves it alone.
    h.provider.seedReview(number, { state: 'changes_requested', body: 'first' });
    h.runtime.enqueue(proposeResult({ summary: 'revised' }));
    expect((await h.engine.drive(await current(h, number))).kind).toBe('revise');

    const answered = await h.engine.drive(await current(h, number));
    expect(answered.kind).toBe('idle');

    h.provider.seedReview(number, { state: 'changes_requested', body: 'new feedback' });
    h.runtime.enqueue(proposeResult({ summary: 'revised again' }));
    const acted = await h.engine.drive(await current(h, number));
    expect(acted.kind).toBe('revise');
    expect(h.runtime.requests.filter((r) => r.context.skill === 'propose')).toHaveLength(3);
  });

  it('answers a review submitted while a turn is running on the next poll', async () => {
    const provider = new FakeProvider();
    let number = -1;
    let turns = 0;
    // The second turn (the revise) sees a review submitted while it runs: after
    // the engine read the reviews and before the turn's comment is posted.
    const runtime = new FakeRuntime(() => {
      turns += 1;
      if (turns === 2) provider.seedReview(number, { state: 'changes_requested', body: 'late' });
      return proposeResult({ summary: `turn ${turns}` });
    });
    const h = harness({ provider, runtime });
    number = await startedWith(h);

    h.provider.seedReview(number, { state: 'changes_requested', body: 'first' });
    expect((await h.engine.drive(await current(h, number))).kind).toBe('revise');

    // The late review is older than the revise turn's comment but was never read.
    const late = await h.engine.drive(await current(h, number));
    expect(late.kind).toBe('revise');
    expect(late.kind === 'revise' ? late.trigger.body : undefined).toBe('late');

    expect((await h.engine.drive(await current(h, number))).kind).toBe('idle');
    expect(turns).toBe(3);
  });

  it('keeps the watermark of comments posted before the answered marker', async () => {
    const h = harness();
    await seedIssue(h.provider, 1);
    h.provider.seedPullRequest({
      number: 100,
      branch: 'openspec/issue-1',
      labels: [DEFAULT_LABELS.proposing],
    });
    const target = { kind: 'pull_request' as const, ref: { repo: h.provider.repo, number: 100 } };
    h.provider.seedReview(100, { state: 'changes_requested', body: 'answered before markers' });
    // A turn comment from before the marker existed: it dates by its own time.
    h.provider.seedComment(target, {
      author: { login: 'openspec-bot', isBot: true },
      body: '**OpenSpec propose turn**',
    });

    expect((await h.engine.drive(await current(h, 100))).kind).toBe('idle');
  });

  it("counts a non-host-flagged bot's turns toward the revise limit", async () => {
    const h = harness({ provider: nonFlaggedBotProvider(), maxReviseRounds: 1 });
    const number = await startedWith(h);

    h.provider.seedReview(number, { state: 'changes_requested', body: 'first' });
    h.runtime.enqueue(proposeResult({ summary: 'revised once' }));
    const first = await h.engine.drive(await current(h, number));
    expect(first.kind).toBe('revise');

    h.provider.seedReview(number, { state: 'changes_requested', body: 'second' });
    const second = await h.engine.drive(await current(h, number));
    expect(second.kind).toBe('fail');
    expect(await labelsOf(h.provider, number)).toContain(DEFAULT_LABELS.failed);
  });

  it('gives a change that is ready on every turn the full revise budget', async () => {
    // Every propose turn that reaches READY also posts a readiness prompt;
    // only the turn itself counts toward the limit.
    const h = harness({ ready: true, maxReviseRounds: 2 });
    const number = await startedWith(h);

    for (const body of ['first', 'second']) {
      h.provider.seedReview(number, { state: 'changes_requested', body });
      h.runtime.enqueue(proposeResult({ summary: `revised after ${body}` }));
      const action = await h.engine.drive(await current(h, number));
      expect(action.kind).toBe('revise');
      expect(await labelsOf(h.provider, number)).toContain(DEFAULT_LABELS.ready);
    }

    h.provider.seedReview(number, { state: 'changes_requested', body: 'third' });
    const limited = await h.engine.drive(await current(h, number));
    expect(limited.kind).toBe('fail');
    expect(h.runtime.requests.filter((r) => r.context.skill === 'propose')).toHaveLength(3);
  });

  it('does not count notices that are not propose turns toward the revise limit', async () => {
    const h = harness({ maxReviseRounds: 1 });
    const number = await startedWith(h);
    const target = { kind: 'pull_request' as const, ref: { repo: h.provider.repo, number } };
    await h.provider.comment(target, 'Could not update the pull request title: boom');

    h.provider.seedReview(number, { state: 'changes_requested', body: 'fix X' });
    h.runtime.enqueue(proposeResult({ summary: 'revised' }));
    const action = await h.engine.drive(await current(h, number));
    expect(action.kind).toBe('revise');
  });
});
