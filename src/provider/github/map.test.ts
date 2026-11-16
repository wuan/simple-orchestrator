import { describe, expect, it } from 'vitest';

import {
  mapIssue,
  mapPullRequest,
  type GithubIssuePayload,
  type GithubPullPayload,
} from './map.js';

const REPO = { owner: 'acme', name: 'widget' };

function pullPayload(overrides: Partial<GithubPullPayload> = {}): GithubPullPayload {
  return {
    number: 10,
    title: 'Pull 10',
    body: null,
    state: 'open',
    draft: true,
    node_id: 'PR_kwDOABCD',
    head: { ref: 'openspec/issue-10' },
    base: { ref: 'main' },
    labels: [],
    ...overrides,
  };
}

function issuePayload(overrides: Partial<GithubIssuePayload> = {}): GithubIssuePayload {
  return {
    number: 7,
    title: 'Issue 7',
    body: null,
    state: 'open',
    labels: [],
    ...overrides,
  };
}

describe('mapPullRequest', () => {
  it('carries the GraphQL node id so the provider can address mutations', () => {
    const pullRequest = mapPullRequest(REPO, pullPayload());

    expect(pullRequest.nodeId).toBe('PR_kwDOABCD');
  });

  it('omits the node id when the payload does not carry one', () => {
    const { node_id: _nodeId, ...withoutNodeId } = pullPayload();
    const pullRequest = mapPullRequest(REPO, withoutNodeId);

    expect(pullRequest.nodeId).toBeUndefined();
  });

  it('maps draft state and merges', () => {
    expect(mapPullRequest(REPO, pullPayload({ draft: false })).draft).toBe(false);
    expect(mapPullRequest(REPO, pullPayload({ merged_at: '2026-01-01T00:00:00Z' })).state).toBe(
      'merged',
    );
  });

  it('carries the web URL when the payload exposes one', () => {
    const pullRequest = mapPullRequest(
      REPO,
      pullPayload({ html_url: 'https://github.com/acme/widget/pull/10' }),
    );

    expect(pullRequest.url).toBe('https://github.com/acme/widget/pull/10');
  });

  it('omits the web URL when the payload carries none', () => {
    expect(mapPullRequest(REPO, pullPayload()).url).toBeUndefined();
    expect(mapPullRequest(REPO, pullPayload({ html_url: null })).url).toBeUndefined();
  });
});

describe('mapIssue', () => {
  it('carries the web URL when the payload exposes one', () => {
    const issue = mapIssue(
      REPO,
      issuePayload({ html_url: 'https://github.com/acme/widget/issues/7' }),
    );

    expect(issue.url).toBe('https://github.com/acme/widget/issues/7');
  });

  it('omits the web URL when the payload carries none', () => {
    expect(mapIssue(REPO, issuePayload()).url).toBeUndefined();
    expect(mapIssue(REPO, issuePayload({ html_url: null })).url).toBeUndefined();
  });
});
