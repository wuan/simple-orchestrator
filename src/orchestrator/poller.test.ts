import { describe, expect, it } from 'vitest';

import { DEFAULT_LABELS } from '../config/types.js';
import type { TurnResult } from '../domain/types.js';
import { FakeProvider } from '../provider/fake/fake-provider.js';
import { FakeRuntime } from '../runtime/fake/fake-runtime.js';
import { LimitExceededError } from '../runtime/limits.js';
import { Poller } from './poller.js';
import { FakeOpenspecCli } from './testing/fake-openspec.js';
import { FakeSandbox } from './testing/fake-sandbox.js';

function proposeResult(): TurnResult {
  return {
    skill: 'propose',
    commits: ['c1'],
    summary: 'proposed',
    questions: [],
    needsInput: false,
    agentClaimsReady: false,
  };
}

function makePoller(
  provider: FakeProvider,
  runtime: FakeRuntime,
  openspec: FakeOpenspecCli,
): Poller {
  return new Poller({
    provider,
    runtime,
    sandbox: new FakeSandbox(),
    openspec,
    labels: DEFAULT_LABELS,
    baseBranch: 'main',
  });
}

describe('Poller.pollOnce', () => {
  it('starts labeled issues and does not duplicate them on the next poll', async () => {
    const provider = new FakeProvider();
    const runtime = new FakeRuntime();
    const openspec = new FakeOpenspecCli();
    openspec.markInProgress('add-x');
    provider.seedIssue({ number: 1, labels: ['openspec'] });
    provider.seedIssue({ number: 2 });
    runtime.enqueue(proposeResult());

    const poller = makePoller(provider, runtime, openspec);
    const first = await poller.pollOnce();
    expect(first.started).toEqual([1]);
    expect(
      await provider.listPullRequestsForIssue({ repo: provider.repo, number: 1 }),
    ).toHaveLength(1);

    const second = await poller.pollOnce();
    expect(second.started).toEqual([]);
    expect(runtime.requests).toHaveLength(1);
  });

  it('resumes an in-flight workflow after a restart without duplicating turns', async () => {
    const provider = new FakeProvider();
    const runtime = new FakeRuntime();
    const openspec = new FakeOpenspecCli();
    openspec.markInProgress('add-x');
    provider.seedIssue({ number: 1, labels: ['openspec'] });
    runtime.enqueue(proposeResult());

    await makePoller(provider, runtime, openspec).pollOnce();

    // A brand-new poller (simulating a restart) sees only host state.
    const report = await makePoller(provider, runtime, openspec).pollOnce();
    expect(report.started).toEqual([]);
    expect(runtime.requests).toHaveLength(1);
  });

  it('turns new reviewer feedback into a revise turn', async () => {
    const provider = new FakeProvider();
    const runtime = new FakeRuntime();
    const openspec = new FakeOpenspecCli();
    openspec.markInProgress('add-x');
    provider.seedIssue({ number: 1, labels: ['openspec'] });
    runtime.enqueue(proposeResult());

    const poller = makePoller(provider, runtime, openspec);
    await poller.pollOnce();

    provider.seedReview(100, { state: 'changes_requested', body: 'please adjust' });
    runtime.enqueue(proposeResult());

    const report = await poller.pollOnce();
    expect(report.actions).toContainEqual({ pullRequest: 100, kind: 'revise' });
    expect(runtime.requests).toHaveLength(2);
  });

  it('recovers an open pull request left without a phase', async () => {
    const provider = new FakeProvider();
    const runtime = new FakeRuntime();
    const openspec = new FakeOpenspecCli();
    openspec.markInProgress('add-x');
    provider.seedIssue({ number: 1, labels: ['openspec'] });
    provider.seedPullRequest({ number: 100, branch: 'openspec/issue-1', linkedIssue: 1 });
    runtime.enqueue(proposeResult());

    const report = await makePoller(provider, runtime, openspec).pollOnce();

    expect(report.started).toEqual([]);
    expect(report.recovered).toEqual([1]);
    expect(runtime.requests).toHaveLength(1);
    const pullRequest = await provider.getPullRequest({ repo: provider.repo, number: 100 });
    expect(pullRequest?.labels).toContain(DEFAULT_LABELS.proposing);
  });

  it('recovers an open pull request in the failed phase', async () => {
    const provider = new FakeProvider();
    const runtime = new FakeRuntime();
    const openspec = new FakeOpenspecCli();
    openspec.markInProgress('add-x');
    provider.seedIssue({ number: 1, labels: ['openspec'] });
    provider.seedPullRequest({
      number: 100,
      branch: 'openspec/issue-1',
      linkedIssue: 1,
      labels: [DEFAULT_LABELS.failed],
    });
    runtime.enqueue(proposeResult());

    const report = await makePoller(provider, runtime, openspec).pollOnce();

    expect(report.recovered).toEqual([1]);
    expect(runtime.requests).toHaveLength(1);
    expect(runtime.requests[0]?.context.skill).toBe('propose');
  });

  it('leaves an in-flight pull request to review-driven discovery', async () => {
    const provider = new FakeProvider();
    const runtime = new FakeRuntime();
    provider.seedIssue({ number: 1, labels: ['openspec'] });
    provider.seedPullRequest({
      number: 100,
      branch: 'openspec/issue-1',
      linkedIssue: 1,
      labels: [DEFAULT_LABELS.proposing],
    });

    const report = await makePoller(provider, runtime, new FakeOpenspecCli()).pollOnce();

    expect(report.recovered).toEqual([]);
    expect(report.actions).toContainEqual({ pullRequest: 100, kind: 'idle' });
    expect(runtime.requests).toHaveLength(0);
  });

  it('attempts recovery for a pull request at most once per process', async () => {
    const provider = new FakeProvider();
    // A permanent failure, so the turn is not retried and each attempt is one request.
    const runtime = new FakeRuntime(() => {
      throw new LimitExceededError('steps');
    });
    provider.seedIssue({ number: 1, labels: ['openspec'] });
    provider.seedPullRequest({
      number: 100,
      branch: 'openspec/issue-1',
      linkedIssue: 1,
      labels: [DEFAULT_LABELS.failed],
    });

    const poller = makePoller(provider, runtime, new FakeOpenspecCli());
    const first = await poller.pollOnce();
    expect(first.recovered).toEqual([1]);
    expect(runtime.requests).toHaveLength(1);

    const second = await poller.pollOnce();
    expect(second.recovered).toEqual([]);
    expect(runtime.requests).toHaveLength(1);
  });

  it('grants one more recovery attempt after a restart', async () => {
    const provider = new FakeProvider();
    // The first process fails permanently, so recovery is not retried inside it.
    const runtime = new FakeRuntime(() => {
      throw new LimitExceededError('steps');
    });
    const openspec = new FakeOpenspecCli();
    openspec.markInProgress('add-x');
    provider.seedIssue({ number: 1, labels: ['openspec'] });
    provider.seedPullRequest({
      number: 100,
      branch: 'openspec/issue-1',
      linkedIssue: 1,
      labels: [DEFAULT_LABELS.failed],
    });

    await makePoller(provider, runtime, openspec).pollOnce();
    expect(runtime.requests).toHaveLength(1);

    // A new poller (a restart) is granted one more attempt.
    runtime.enqueue(proposeResult());
    const report = await makePoller(provider, runtime, openspec).pollOnce();
    expect(report.recovered).toEqual([1]);
    expect(runtime.requests).toHaveLength(2);
  });
});
