import type { ReviewState } from '../../domain/types.js';
import { runProviderContractTests } from '../contract.js';
import { GitHubProvider } from './provider.js';
import { InMemoryGitHub } from './testing/in-memory-github.js';
import { RecordingCommands } from './testing/recording-commands.js';

runProviderContractTests('GitHubProvider', () => {
  const github = new InMemoryGitHub();
  const provider = new GitHubProvider({
    repo: { owner: github.owner, name: github.repo },
    token: 'contract-token',
    http: github,
    commands: new RecordingCommands(),
    gitBaseUrl: 'https://github.com',
  });
  let nextIssue = 1;
  return {
    provider,
    async seedTriggerIssue(): Promise<number> {
      const number = nextIssue++;
      github.seedIssue({ number, labels: ['openspec'] });
      return number;
    },
    async seedHumanReview(pullRequest: number, state: ReviewState): Promise<void> {
      github.seedReview({ pull: pullRequest, state, login: 'reviewer' });
    },
  };
});
