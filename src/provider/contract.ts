import { describe, expect, it } from 'vitest';

import type { ReviewState } from '../domain/types.js';
import type { ProviderPullRequest, RepoProvider } from './types.js';

/**
 * A fixture lets a provider be seeded through its own host. The same contract
 * battery then runs against every provider implementation.
 */
export interface ProviderFixture {
  provider: RepoProvider;
  seedTriggerIssue(): Promise<number>;
  seedHumanReview(pullRequest: number, state: ReviewState): Promise<void>;
}

async function startWorkflow(fixture: ProviderFixture): Promise<ProviderPullRequest> {
  const { provider } = fixture;
  const issueNumber = await fixture.seedTriggerIssue();
  return provider.createDraftPullRequest({
    issue: { repo: provider.repo, number: issueNumber },
    baseBranch: 'main',
    title: 'Change',
    body: 'body',
    draft: true,
  });
}

/**
 * The reusable provider contract. A new provider is expected to pass this
 * battery unchanged.
 */
export function runProviderContractTests(name: string, makeFixture: () => ProviderFixture): void {
  describe(`RepoProvider contract (${name})`, () => {
    it('reports a bot identity', async () => {
      const { provider } = makeFixture();
      const bot = await provider.botIdentity();
      expect(typeof bot.login).toBe('string');
      expect(bot.isBot).toBe(true);
    });

    it('discovers a labeled open issue', async () => {
      const fixture = makeFixture();
      const number = await fixture.seedTriggerIssue();
      const issues = await fixture.provider.listTriggerIssues('openspec');
      expect(issues.map((issue) => issue.ref.number)).toContain(number);
    });

    it('starts a workflow as a single draft pull request linked to the issue', async () => {
      const fixture = makeFixture();
      const created = await startWorkflow(fixture);
      expect(created.draft).toBe(true);
      const found = await fixture.provider.listPullRequestsForIssue({
        repo: fixture.provider.repo,
        number: created.linkedIssue?.number ?? -1,
      });
      expect(found.map((pr) => pr.ref.number)).toContain(created.ref.number);
    });

    it('round-trips labels on a pull request', async () => {
      const fixture = makeFixture();
      const { provider } = fixture;
      const pr = await startWorkflow(fixture);

      await provider.addLabels({ kind: 'pull_request', ref: pr.ref }, ['openspec:proposing']);
      let stored = await provider.getPullRequest(pr.ref);
      expect(stored?.labels).toContain('openspec:proposing');

      await provider.removeLabel({ kind: 'pull_request', ref: pr.ref }, 'openspec:proposing');
      stored = await provider.getPullRequest(pr.ref);
      expect(stored?.labels).not.toContain('openspec:proposing');
    });

    it('posts and lists comments', async () => {
      const fixture = makeFixture();
      const { provider } = fixture;
      const pr = await startWorkflow(fixture);
      const target = { kind: 'pull_request' as const, ref: pr.ref };

      await provider.comment(target, 'contract comment');
      const comments = await provider.listComments(target);
      expect(comments.map((comment) => comment.body)).toContain('contract comment');
    });

    it('reports normalized review state', async () => {
      const fixture = makeFixture();
      const { provider } = fixture;
      const pr = await startWorkflow(fixture);

      await fixture.seedHumanReview(pr.ref.number, 'changes_requested');
      const reviews = await provider.listReviews(pr.ref);
      expect(reviews.map((review) => review.state)).toContain('changes_requested');
    });

    it('finds pull requests by label', async () => {
      const fixture = makeFixture();
      const { provider } = fixture;
      const pr = await startWorkflow(fixture);
      await provider.addLabels({ kind: 'pull_request', ref: pr.ref }, ['openspec:proposing']);

      const found = await provider.listPullRequestsWithLabel('openspec:proposing');
      expect(found.map((pull) => pull.ref.number)).toContain(pr.ref.number);
    });

    it('clones the workflow branch', async () => {
      const fixture = makeFixture();
      const { provider } = fixture;
      const pr = await startWorkflow(fixture);
      await expect(
        provider.clone({ branch: pr.branch, destination: '/tmp/contract-work' }),
      ).resolves.toBeUndefined();
    });

    it('fetches into an existing clone', async () => {
      const { provider } = makeFixture();
      await expect(provider.fetch({ destination: '/tmp/contract-work' })).resolves.toBeUndefined();
    });

    it('pushes the workflow branch', async () => {
      const fixture = makeFixture();
      const pr = await startWorkflow(fixture);
      await expect(
        fixture.provider.push({ branch: pr.branch, destination: '/tmp/contract-work' }),
      ).resolves.toBeUndefined();
    });
  });
}
