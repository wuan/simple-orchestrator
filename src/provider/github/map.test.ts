import { describe, expect, it } from 'vitest';

import { mapPullRequest, type GithubPullPayload } from './map.js';

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
});
