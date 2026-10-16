import { ConfigError } from './config/loader.js';
import { resolveCredentials, type CredentialResolver } from './config/credentials.js';
import { repoKey, type OrchestratorConfig, type RepositoryConfig } from './config/types.js';
import { Poller } from './orchestrator/poller.js';
import { NodeOpenspecCli, type OpenspecCli } from './orchestrator/readiness.js';
import { FakeProvider } from './provider/fake/fake-provider.js';
import { GhCliCloner } from './provider/github/clone.js';
import { GhCliTransport } from './provider/github/gh-cli.js';
import { GitHubProvider } from './provider/github/provider.js';
import type { RepoProvider } from './provider/types.js';
import { RepositoryStore } from './runtime/repository-store.js';
import { WorktreeSandbox } from './runtime/sandbox.js';
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
  /**
   * Build the poller logger from the credentials resolved at startup. When
   * supplied (and no explicit `logger` is given) the returned sink is used for
   * verbose diagnostics; the resolved secrets seed its redactor.
   */
  loggerFactory?: (credentials: Map<string, string>) => (message: string) => void;
}

/**
 * Build the built-in providers. `github` talks to GitHub through the `gh` CLI;
 * `fake` is an in-memory provider for smoke tests.
 */
export function defaultProviderFactory(repo: RepositoryConfig, credential: string): RepoProvider {
  if (repo.provider === 'github') {
    const commands = new NodeCommandRunner();
    const location = { owner: repo.owner, name: repo.name };
    return new GitHubProvider({
      repo: location,
      transport: new GhCliTransport({ commands, token: credential }),
      cloner: new GhCliCloner({ commands, token: credential, ...location }),
    });
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
export async function createService(
  config: OrchestratorConfig,
  options: BuildServiceOptions,
): Promise<Service> {
  const credentials = await resolveCredentials(config, options.credentials);
  const providerFactory = options.providerFactory ?? defaultProviderFactory;
  const runtime = options.runtime ?? new UnconfiguredRuntime();
  const openspec = options.openspec ?? new NodeOpenspecCli(new NodeCommandRunner());
  const store = new RepositoryStore({ root: config.workspace.root });
  const logger = options.logger ?? options.loggerFactory?.(credentials);

  const repositories = config.repositories.map((repo): ServiceRepository => {
    const key = repoKey(repo);
    const credential = credentials.get(key) ?? '';
    const provider = providerFactory(repo, credential);
    const sandbox = new WorktreeSandbox({
      store,
      source: provider,
      baseBranch: repo.baseBranch,
      root: config.workspace.worktrees,
    });
    const poller = new Poller({
      provider,
      runtime,
      sandbox,
      openspec,
      labels: repo.labels,
      baseBranch: repo.baseBranch,
      limits: config.limits,
      maxReviseRounds: repo.maxReviseRounds,
      logger,
    });
    return { key, repo, intervalSeconds: repo.pollIntervalSeconds, poller };
  });

  return { repositories };
}
