import type { ReviewState } from '../../domain/types.js';
import { runProviderContractTests } from '../contract.js';
import { TokenCloner } from './clone.js';
import { GitHubProvider } from './provider.js';
import { GitHubRest } from './rest.js';
import { InMemoryGitHub } from './testing/in-memory-github.js';
import { RecordingCommands } from './testing/recording-commands.js';

runProviderContractTests('GitHubProvider', () => {
  const github = new InMemoryGitHub();
  const provider = new GitHubProvider({
    repo: { owner: github.owner, name: github.repo },
    transport: new GitHubRest({
      token: 'contract-token',
      http: github,
      baseUrl: 'https://api.github.com',
    }),
    cloner: new TokenCloner({
      owner: github.owner,
      name: github.repo,
      token: 'contract-token',
      commands: new RecordingCommands(),
      gitBaseUrl: 'https://github.com',
    }),
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
