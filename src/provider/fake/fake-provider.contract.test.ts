import { describe, expect, it } from 'vitest';

import type { ReviewState } from '../../domain/types.js';
import { runProviderContractTests, type ProviderFixture } from '../contract.js';
import { FakeProvider } from './fake-provider.js';

function makeFixture(): ProviderFixture {
  const provider = new FakeProvider();
  let nextIssue = 1000;
  return {
    provider,
    async seedTriggerIssue(): Promise<number> {
      const number = nextIssue++;
      provider.seedIssue({ number, labels: ['openspec'] });
      return number;
    },
    async seedHumanReview(pullRequest: number, state: ReviewState): Promise<void> {
      provider.seedReview(pullRequest, { state });
    },
  };
}

describe('FakeProvider contract', () => {
  // The shared battery stays the single source of contract cases; this file
  // additionally declares a test the analyser can see.
  runProviderContractTests('FakeProvider', makeFixture);

  it('exposes the provider the shared contract battery exercises', () => {
    expect(makeFixture().provider.id).toBe('fake');
  });
});
