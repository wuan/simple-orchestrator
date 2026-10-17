import { describe, expect, it } from 'vitest';

import { FakeProvider } from './fake-provider.js';

describe('FakeProvider', () => {
  it('discovers only labeled, open issues', async () => {
    const provider = new FakeProvider();
    provider.seedIssue({ number: 1, labels: ['openspec'] });
    provider.seedIssue({ number: 2 });
    provider.seedIssue({ number: 3, labels: ['openspec'], state: 'closed' });

    const found = await provider.listTriggerIssues('openspec');
    expect(found.map((issue) => issue.ref.number)).toEqual([1]);
  });

  it('creates one draft pull request per issue and lists it', async () => {
    const provider = new FakeProvider();
    provider.seedIssue({ number: 7, labels: ['openspec'] });

    const created = await provider.createDraftPullRequest({
      issue: { repo: provider.repo, number: 7 },
      branch: 'openspec/issue-7',
      baseBranch: 'main',
      title: 'Issue 7',
      body: 'body',
      draft: true,
    });
    expect(created.draft).toBe(true);
    expect(created.linkedIssue?.number).toBe(7);

    const forIssue = await provider.listPullRequestsForIssue({ repo: provider.repo, number: 7 });
    expect(forIssue).toHaveLength(1);
    expect(await provider.getPullRequest(created.ref)).toMatchObject({
      branch: 'openspec/issue-7',
    });
  });

  it('manages labels on issues and pull requests', async () => {
    const provider = new FakeProvider();
    provider.seedIssue({ number: 1, labels: ['openspec'] });
    const pr = provider.seedPullRequest({ number: 10, linkedIssue: 1 });

    await provider.addLabels({ kind: 'pull_request', ref: pr.ref }, ['openspec:proposing']);
    await provider.addLabels({ kind: 'pull_request', ref: pr.ref }, ['openspec:proposing']);
    let stored = await provider.getPullRequest(pr.ref);
    expect(stored?.labels).toEqual(['openspec:proposing']);

    await provider.removeLabel({ kind: 'pull_request', ref: pr.ref }, 'openspec:proposing');
    stored = await provider.getPullRequest(pr.ref);
    expect(stored?.labels).toEqual([]);
  });

  it('records comments and clones', async () => {
    const provider = new FakeProvider();
    const pr = provider.seedPullRequest({ number: 10 });
    await provider.comment({ kind: 'pull_request', ref: pr.ref }, 'hello');

    const comments = await provider.listComments({ kind: 'pull_request', ref: pr.ref });
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toBe('hello');
    expect(comments[0]?.author.isBot).toBe(true);
    expect(provider.commentLog).toHaveLength(1);

    await provider.clone({ branch: 'openspec/issue-1', destination: '/tmp/x' });
    expect(provider.clones).toEqual([{ branch: 'openspec/issue-1', destination: '/tmp/x' }]);

    await provider.fetch({ destination: '/tmp/x' });
    expect(provider.fetches).toEqual([{ destination: '/tmp/x' }]);
  });

  it('marks a draft pull request ready for review', async () => {
    const provider = new FakeProvider();
    const pr = provider.seedPullRequest({ number: 10, draft: true });

    await provider.markPullRequestReady(pr.ref);
    expect((await provider.getPullRequest(pr.ref))?.draft).toBe(false);

    // Marking an already-ready pull request is a no-op.
    await expect(provider.markPullRequestReady(pr.ref)).resolves.toBeUndefined();
    expect((await provider.getPullRequest(pr.ref))?.draft).toBe(false);
  });

  it('reports the bot identity', async () => {
    const provider = new FakeProvider();
    expect((await provider.botIdentity()).isBot).toBe(true);
  });
});
