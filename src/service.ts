import { ConfigError } from './config/loader.js';
import { resolveCredentials, type CredentialResolver } from './config/credentials.js';
import { repoKey, type OrchestratorConfig, type RepositoryConfig } from './config/types.js';
import { Poller } from './orchestrator/poller.js';
import { NodeOpenspecCli, type OpenspecCli } from './orchestrator/readiness.js';
import { FakeProvider } from './provider/fake/fake-provider.js';
import { GitHubProvider } from './provider/github/provider.js';
import type { RepoProvider } from './provider/types.js';
import { EphemeralWorkspaceSandbox } from './runtime/sandbox.js';
import type { AgentRuntime } from './runtime/types.js';
import { UnconfiguredRuntime } from './runtime/unconfigured.js';
import { NodeCommandRunner } from './system/commands.js';

export type ProviderFactory = (repo: RepositoryConfig, credential: string) => RepoProvider;

export interface ServiceRepository {
  key: string;
  repo: RepositoryConfig;
  intervalSeconds: number;
  poller: Poller;
}

export interface Service {
  repositories: ServiceRepository[];
}

export interface BuildServiceOptions {
  credentials: CredentialResolver;
  providerFactory?: ProviderFactory;
  runtime?: AgentRuntime;
  openspec?: OpenspecCli;
  logger?: (message: string) => void;
}

/** Build the built-in providers. `fake` is an in-memory provider for smoke tests. */
export function defaultProviderFactory(repo: RepositoryConfig, credential: string): RepoProvider {
  if (repo.provider === 'github') {
    return new GitHubProvider({ repo: { owner: repo.owner, name: repo.name }, token: credential });
  }
  if (repo.provider === 'fake') {
    return new FakeProvider({ repo: { owner: repo.owner, name: repo.name } });
  }
  throw new ConfigError(`unsupported provider '${repo.provider}'`, repoKey(repo));
}

/**
 * Compose the service from configuration: resolve credentials, build one
 * provider + sandbox + poller per repository, and wire the runtime.
 */
export function createService(config: OrchestratorConfig, options: BuildServiceOptions): Service {
  const credentials = resolveCredentials(config, options.credentials);
  const providerFactory = options.providerFactory ?? defaultProviderFactory;
  const runtime = options.runtime ?? new UnconfiguredRuntime();
  const openspec = options.openspec ?? new NodeOpenspecCli(new NodeCommandRunner());

  const repositories = config.repositories.map((repo): ServiceRepository => {
    const key = repoKey(repo);
    const credential = credentials.get(key) ?? '';
    const provider = providerFactory(repo, credential);
    const sandbox = new EphemeralWorkspaceSandbox({ provider });
    const poller = new Poller({
      provider,
      runtime,
      sandbox,
      openspec,
      labels: repo.labels,
      baseBranch: repo.baseBranch,
      limits: config.limits,
      maxReviseRounds: repo.maxReviseRounds,
      logger: options.logger,
    });
    return { key, repo, intervalSeconds: repo.pollIntervalSeconds, poller };
  });

  return { repositories };
}
