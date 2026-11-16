import { describe, expect, it } from 'vitest';

import { DEFAULT_LABELS, type LabelConfig } from '../config/types.js';
import type { IssueRef } from '../domain/types.js';
import { FakeProvider } from '../provider/fake/fake-provider.js';
import type { ProviderIssue, ProviderPullRequest } from '../provider/types.js';
import { buildSnapshot, type StatusSource } from './snapshot.js';

/** A fake provider that records which read paths the snapshot exercised. */
class CountingProvider extends FakeProvider {
  readonly reads: string[] = [];

  override listTriggerIssues(label: string): Promise<ProviderIssue[]> {
    this.reads.push('listTriggerIssues');
    return super.listTriggerIssues(label);
  }

  override listPullRequestsForIssue(issue: IssueRef): Promise<ProviderPullRequest[]> {
    this.reads.push('listPullRequestsForIssue');
    return super.listPullRequestsForIssue(issue);
  }

  override listPullRequestsWithLabel(label: string): Promise<ProviderPullRequest[]> {
    this.reads.push('listPullRequestsWithLabel');
    return super.listPullRequestsWithLabel(label);
  }
}

function source(provider: FakeProvider, labels: LabelConfig = DEFAULT_LABELS): StatusSource {
  return { key: `${provider.id}:${provider.repo.owner}/${provider.repo.name}`, labels, provider };
}

describe('buildSnapshot', () => {
  it('reports a trigger-labeled issue with no pull request as queued', async () => {
    const provider = new FakeProvider();
    provider.seedIssue({ number: 7, title: 'Add a status view', labels: [DEFAULT_LABELS.trigger] });

    const snapshot = await buildSnapshot([source(provider)]);

    expect(snapshot.repositories).toHaveLength(1);
    expect(snapshot.repositories[0]?.workflows).toEqual([
      {
        phase: 'queued',
        issue: { number: 7, title: 'Add a status view', url: expect.any(String) },
      },
    ]);
  });

  it('reports an in-flight workflow with its lifecycle phase', async () => {
    const provider = new FakeProvider();
    provider.seedIssue({ number: 1, labels: [DEFAULT_LABELS.trigger] });
    provider.seedPullRequest({ number: 10, linkedIssue: 1, labels: [DEFAULT_LABELS.ready] });

    const snapshot = await buildSnapshot([source(provider)]);

    expect(snapshot.repositories[0]?.workflows).toHaveLength(1);
    expect(snapshot.repositories[0]?.workflows[0]).toMatchObject({
      phase: 'ready',
      pullRequest: { number: 10 },
    });
  });

  it.each([
    ['proposing', DEFAULT_LABELS.proposing],
    ['ready', DEFAULT_LABELS.ready],
    ['implementing', DEFAULT_LABELS.implementing],
    ['failed', DEFAULT_LABELS.failed],
  ])('reports a workflow in the %s phase', async (phase, label) => {
    const provider = new FakeProvider();
    provider.seedIssue({ number: 1, labels: [DEFAULT_LABELS.trigger] });
    provider.seedPullRequest({ number: 10, linkedIssue: 1, labels: [label] });

    const snapshot = await buildSnapshot([source(provider)]);

    expect(snapshot.repositories[0]?.workflows[0]?.phase).toBe(phase);
  });

  it('omits a workflow whose pull request has merged and reached done', async () => {
    const provider = new FakeProvider();
    provider.seedIssue({ number: 1, labels: [DEFAULT_LABELS.trigger] });
    provider.seedPullRequest({
      number: 10,
      linkedIssue: 1,
      state: 'merged',
      labels: [DEFAULT_LABELS.done],
    });

    const snapshot = await buildSnapshot([source(provider)]);

    expect(snapshot.repositories[0]?.workflows).toEqual([]);
  });

  it('unions pull requests found by lifecycle label even without a trigger issue', async () => {
    const provider = new FakeProvider();
    provider.seedPullRequest({
      number: 42,
      branch: 'openspec/issue-42',
      labels: [DEFAULT_LABELS.implementing],
    });

    const snapshot = await buildSnapshot([source(provider)]);

    expect(snapshot.repositories[0]?.workflows).toEqual([
      expect.objectContaining({
        phase: 'implementing',
        issue: { number: 42, title: expect.any(String), url: expect.any(String) },
      }),
    ]);
  });

  it('reads only the configured repositories', async () => {
    const configured = new CountingProvider({ repo: { owner: 'acme', name: 'widget' } });
    const unconfigured = new CountingProvider({ repo: { owner: 'acme', name: 'gadget' } });

    const snapshot = await buildSnapshot([source(configured)]);

    expect(snapshot.repositories.map((repository) => repository.name)).toEqual(['widget']);
    expect(unconfigured.reads).toEqual([]);
  });

  it('stamps the snapshot with the injected clock', async () => {
    const provider = new FakeProvider();
    const clock = (): Date => new Date('2026-11-16T12:00:00.000Z');

    const snapshot = await buildSnapshot([source(provider)], clock);

    expect(snapshot.generatedAt).toBe('2026-11-16T12:00:00.000Z');
  });
});
