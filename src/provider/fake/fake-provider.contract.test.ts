import type { ReviewState } from '../../domain/types.js';
import { runProviderContractTests } from '../contract.js';
import { FakeProvider } from './fake-provider.js';

runProviderContractTests('FakeProvider', () => {
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
});
