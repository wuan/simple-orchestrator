import { describe, expect, it } from 'vitest';

import { GitHubProvider } from './provider.js';
import { InMemoryGitHub } from './testing/in-memory-github.js';
import { RecordingCommands } from './testing/recording-commands.js';

function setup(): { provider: GitHubProvider; github: InMemoryGitHub; commands: RecordingCommands } {
  const github = new InMemoryGitHub();
  const commands = new RecordingCommands();
  const provider = new GitHubProvider({
    repo: { owner: github.owner, name: github.repo },
    token: 'secret-token',
    http: github,
    commands,
    gitBaseUrl: 'https://github.com',
  });
  return { provider, github, commands };
}

describe('GitHubProvider', () => {
  it('reports the bot identity', async () => {
    const { provider } = setup();
    expect(await provider.botIdentity()).toEqual({ login: 'openspec-bot', isBot: true });
  });

  it('discovers labeled open issues and ignores unlabeled issues and pull requests', async () => {
    const { provider, github } = setup();
    github.seedIssue({ number: 1, labels: ['openspec'] });
    github.seedIssue({ number: 2 });
    github.seedIssue({ number: 3, labels: ['openspec'], state: 'closed' });
    github.seedPull({ number: 50, head: 'feature', labels: ['openspec'] });

    const found = await provider.listTriggerIssues('openspec');
    expect(found.map((issue) => issue.ref.number)).toEqual([1]);
  });

  it('creates a draft pull request on a new branch and finds it for the issue', async () => {
    const { provider, github } = setup();
    github.seedIssue({ number: 7, labels: ['openspec'] });

    const created = await provider.createDraftPullRequest({
      issue: { repo: provider.repo, number: 7 },
      baseBranch: 'main',
      title: 'Issue 7',
      body: 'Closes #7',
      draft: true,
    });
    expect(created.draft).toBe(true);
    expect(created.branch).toBe('openspec/issue-7');
    expect(created.linkedIssue?.number).toBe(7);

    const forIssue = await provider.listPullRequestsForIssue({ repo: provider.repo, number: 7 });
    expect(forIssue.map((pr) => pr.ref.number)).toEqual([created.ref.number]);
  });

  it('manages lifecycle labels on a pull request', async () => {
    const { provider, github } = setup();
    github.seedPull({ number: 10, head: 'openspec/issue-1' });

    await provider.addLabels({ kind: 'pull_request', ref: { repo: provider.repo, number: 10 } }, [
      'openspec:proposing',
    ]);
    let pr = await provider.getPullRequest({ repo: provider.repo, number: 10 });
    expect(pr?.labels).toContain('openspec:proposing');

    await provider.removeLabel({ kind: 'pull_request', ref: { repo: provider.repo, number: 10 } }, 'openspec:proposing');
    pr = await provider.getPullRequest({ repo: provider.repo, number: 10 });
    expect(pr?.labels).not.toContain('openspec:proposing');
  });

  it('posts and lists comments', async () => {
    const { provider, github } = setup();
    github.seedPull({ number: 10, head: 'openspec/issue-1' });
    const target = { kind: 'pull_request' as const, ref: { repo: provider.repo, number: 10 } };

    await provider.comment(target, 'hello from the bot');
    const comments = await provider.listComments(target);
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toBe('hello from the bot');
    expect(comments[0]?.author.isBot).toBe(true);
  });

  it('normalizes reviews and drops states the orchestrator ignores', async () => {
    const { provider, github } = setup();
    github.seedPull({ number: 10, head: 'openspec/issue-1' });
    github.seedReview({ pull: 10, state: 'changes_requested', login: 'reviewer' });
    github.seedReview({ pull: 10, state: 'dismissed', login: 'reviewer' });

    const reviews = await provider.listReviews({ repo: provider.repo, number: 10 });
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.state).toBe('changes_requested');
  });

  it('clones the workflow branch without exposing the token in argv', async () => {
    const { provider, commands } = setup();
    await provider.clone({ branch: 'openspec/issue-7', destination: '/tmp/work' });

    const [run] = commands.runs;
    expect(run?.command).toBe('git');
    expect(run?.args).toContain('openspec/issue-7');
    expect(run?.args).toContain('/tmp/work');
    expect(run?.args.join(' ')).not.toContain('secret-token');
    expect(run?.env?.['GIT_CONFIG_VALUE_0']).toContain('secret-token');
  });
});
