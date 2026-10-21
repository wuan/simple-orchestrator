import { readFileSync } from 'node:fs';

import { parse as parseYaml } from 'yaml';

import {
  DEFAULT_AGENT_API_KEY_ENV,
  DEFAULT_AGENT_MODEL,
  DEFAULT_BASE_BRANCH,
  DEFAULT_LABELS,
  DEFAULT_LIMITS,
  DEFAULT_LOGGING,
  DEFAULT_MAX_REVISE_ROUNDS,
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEFAULT_WORKSPACE_ROOT,
  type AgentConfig,
  type EnvironmentSpec,
  type LabelConfig,
  type Limits,
  type LoggingConfig,
  type OrchestratorConfig,
  type RepositoryConfig,
  type RepositoryDefaults,
  type WorkspaceConfig,
} from './types.js';

/** Thrown when configuration is missing or invalid. Fails fast at startup. */
export class ConfigError extends Error {
  readonly repo?: string;

  constructor(message: string, repo?: string) {
    super(repo === undefined ? message : `${message} (repository ${repo})`);
    this.name = 'ConfigError';
    if (repo !== undefined) this.repo = repo;
  }
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError(`${context} must be a mapping`);
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  context: string,
  repo?: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(`${context}: '${key}' is required and must be a non-empty string`, repo);
  }
  return value;
}

function optionalNonEmptyStringValue(
  record: Record<string, unknown>,
  key: string,
  context: string,
  repo?: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(`${context}: '${key}' must be a non-empty string when provided`, repo);
  }
  return value;
}

function optionalNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  context: string,
  fallback: string,
  repo?: string,
): string {
  return optionalNonEmptyStringValue(record, key, context, repo) ?? fallback;
}

function optionalPositiveIntValue(
  record: Record<string, unknown>,
  key: string,
  context: string,
  repo?: string,
): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ConfigError(`${context}: '${key}' must be a positive integer when provided`, repo);
  }
  return value;
}

function optionalPositiveInt(
  record: Record<string, unknown>,
  key: string,
  context: string,
  fallback: number,
  repo?: string,
): number {
  return optionalPositiveIntValue(record, key, context, repo) ?? fallback;
}

/** Read the label fields present in a `labels` mapping, leaving the rest unset. */
function parseLabelValues(
  raw: unknown,
  context: string,
  repo?: string,
): Partial<LabelConfig> | undefined {
  if (raw === undefined) return undefined;
  const record = asRecord(raw, context);
  const labels: Partial<LabelConfig> = {};
  for (const key of Object.keys(DEFAULT_LABELS) as (keyof LabelConfig)[]) {
    const value = record[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ConfigError(`${context}: '${key}' must be a non-empty string`, repo);
    }
    labels[key] = value;
  }
  return labels;
}

function parseLabels(
  entry: Record<string, unknown>,
  context: string,
  repo: string,
  defaults?: Partial<LabelConfig>,
): LabelConfig {
  const overrides = parseLabelValues(entry['labels'], `${context}.labels`, repo);
  return { ...DEFAULT_LABELS, ...defaults, ...overrides };
}

/**
 * Read the environment fields actually present, leaving the rest unset so a
 * partial `defaults.environment` can supply the remainder. Only `image` is
 * checked for presence after the entry and defaults have merged.
 */
function parseEnvironmentValues(
  raw: unknown,
  context: string,
  repo?: string,
): Partial<EnvironmentSpec> | undefined {
  if (raw === undefined) return undefined;
  const record = asRecord(raw, context);
  const environment: Partial<EnvironmentSpec> = {};

  const image = optionalNonEmptyStringValue(record, 'image', context, repo);
  if (image !== undefined) environment.image = image;

  const network = optionalNonEmptyStringValue(record, 'network', context, repo);
  if (network !== undefined) environment.network = network;

  const env = record['env'];
  if (env !== undefined) {
    if (!Array.isArray(env)) {
      throw new ConfigError(`${context}: 'env' must be a list of non-empty strings`, repo);
    }
    environment.env = env.map((value, index) => {
      if (typeof value !== 'string' || value.trim() === '') {
        throw new ConfigError(`${context}: 'env[${index}]' must be a non-empty string`, repo);
      }
      return value;
    });
  }

  const gitIdentity = record['gitIdentity'];
  if (gitIdentity !== undefined) {
    const identityContext = `${context}.gitIdentity`;
    const identity = asRecord(gitIdentity, identityContext);
    environment.gitIdentity = {
      name: requireNonEmptyString(identity, 'name', identityContext, repo),
      email: requireNonEmptyString(identity, 'email', identityContext, repo),
    };
  }

  const caches = record['caches'];
  if (caches !== undefined) {
    if (!Array.isArray(caches)) {
      throw new ConfigError(`${context}: 'caches' must be a list of mappings`, repo);
    }
    environment.caches = caches.map((value, index) => {
      const cacheContext = `${context}.caches[${index}]`;
      const cache = asRecord(value, cacheContext);
      return {
        name: requireNonEmptyString(cache, 'name', cacheContext, repo),
        path: requireNonEmptyString(cache, 'path', cacheContext, repo),
      };
    });
  }

  return environment;
}

/**
 * Merge a repository entry's environment over the shared default, field by
 * field: an entry that sets only `image` keeps the default network, identity,
 * and caches. Arrays are taken wholesale from the layer that sets them.
 */
function mergeEnvironment(
  defaults: Partial<EnvironmentSpec> | undefined,
  entry: Partial<EnvironmentSpec> | undefined,
): Partial<EnvironmentSpec> | undefined {
  if (defaults === undefined) return entry;
  if (entry === undefined) return defaults;
  return { ...defaults, ...entry };
}

/**
 * Validate the optional top-level `defaults` block. Only the fields actually
 * present are set, so a plain entry-over-`defaults` merge preserves the
 * `defaults`-over-built-in order. Required fields are checked after the merge.
 */
function parseDefaults(raw: unknown): RepositoryDefaults {
  if (raw === undefined) return {};
  const context = 'defaults';
  const record = asRecord(raw, context);
  if (record['name'] !== undefined) {
    throw new ConfigError(
      `${context}: 'name' must not be set here; every repository entry must name itself`,
    );
  }

  const defaults: RepositoryDefaults = {};
  for (const key of ['provider', 'owner', 'credential', 'baseBranch'] as const) {
    const value = optionalNonEmptyStringValue(record, key, context);
    if (value !== undefined) defaults[key] = value;
  }
  for (const key of ['pollIntervalSeconds', 'maxReviseRounds'] as const) {
    const value = optionalPositiveIntValue(record, key, context);
    if (value !== undefined) defaults[key] = value;
  }
  const labels = parseLabelValues(record['labels'], `${context}.labels`);
  if (labels !== undefined) defaults.labels = labels;
  const environment = parseEnvironmentValues(record['environment'], `${context}.environment`);
  if (environment !== undefined) defaults.environment = environment;
  return defaults;
}

function parseRepository(
  entry: unknown,
  index: number,
  defaults: RepositoryDefaults,
): RepositoryConfig {
  const context = `repositories[${index}]`;
  const record = asRecord(entry, context);

  const { labels: defaultLabels, ...scalarDefaults } = defaults;
  // The entry wins over the shared defaults; both are validated before merging.
  const resolved: Record<string, unknown> = { ...scalarDefaults, ...record };

  const provider = requireNonEmptyString(resolved, 'provider', context);
  const owner = requireNonEmptyString(resolved, 'owner', context);
  const name = requireNonEmptyString(resolved, 'name', context);
  const repo = `${owner}/${name}`;

  // Required, and its absence fails fast naming the offending repository.
  const credential = requireNonEmptyString(resolved, 'credential', context, repo);

  const baseBranch = optionalNonEmptyString(
    resolved,
    'baseBranch',
    context,
    DEFAULT_BASE_BRANCH,
    repo,
  );
  const pollIntervalSeconds = optionalPositiveInt(
    resolved,
    'pollIntervalSeconds',
    context,
    DEFAULT_POLL_INTERVAL_SECONDS,
    repo,
  );
  const maxReviseRounds = optionalPositiveInt(
    resolved,
    'maxReviseRounds',
    context,
    DEFAULT_MAX_REVISE_ROUNDS,
    repo,
  );

  const environment = resolveEnvironment(
    defaults.environment,
    record['environment'],
    context,
    repo,
  );

  const config: RepositoryConfig = {
    provider,
    owner,
    name,
    credential,
    baseBranch,
    pollIntervalSeconds,
    maxReviseRounds,
    labels: parseLabels(record, context, repo, defaultLabels),
  };
  if (environment !== undefined) config.environment = environment;
  return config;
}

/**
 * Resolve a repository's environment from the shared default and its own block
 * and require the merged result to name an image. Absent from both, the
 * repository keeps the in-process runtime.
 */
function resolveEnvironment(
  defaults: Partial<EnvironmentSpec> | undefined,
  entry: unknown,
  context: string,
  repo: string,
): EnvironmentSpec | undefined {
  const merged = mergeEnvironment(
    defaults,
    parseEnvironmentValues(entry, `${context}.environment`, repo),
  );
  if (merged === undefined) return undefined;
  if (merged.image === undefined) {
    throw new ConfigError(
      `${context}: 'environment.image' is required and must be a non-empty string`,
      repo,
    );
  }
  return merged as EnvironmentSpec;
}

function parseLimits(raw: unknown): Limits {
  if (raw === undefined) return { ...DEFAULT_LIMITS };
  const record = asRecord(raw, 'limits');
  return {
    maxSteps: optionalPositiveInt(record, 'maxSteps', 'limits', DEFAULT_LIMITS.maxSteps),
    maxTokens: optionalPositiveInt(record, 'maxTokens', 'limits', DEFAULT_LIMITS.maxTokens),
    maxDurationMs: optionalPositiveInt(
      record,
      'maxDurationMs',
      'limits',
      DEFAULT_LIMITS.maxDurationMs,
    ),
  };
}

function parseAgent(raw: unknown): AgentConfig {
  const record = raw === undefined ? {} : asRecord(raw, 'agent');
  const agent: AgentConfig = {
    model: optionalNonEmptyString(record, 'model', 'agent', DEFAULT_AGENT_MODEL),
    apiKeyEnv: optionalNonEmptyString(record, 'apiKeyEnv', 'agent', DEFAULT_AGENT_API_KEY_ENV),
  };
  const apiEndpoint = optionalNonEmptyStringValue(record, 'apiEndpoint', 'agent');
  if (apiEndpoint !== undefined) agent.apiEndpoint = apiEndpoint;
  for (const key of ['agent', 'database'] as const) {
    const value = record[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ConfigError(`agent: '${key}' must be a non-empty string when provided`);
    }
    agent[key] = value;
  }
  return agent;
}

function parseWorkspace(raw: unknown): WorkspaceConfig {
  if (raw === undefined) return { root: DEFAULT_WORKSPACE_ROOT };
  const record = asRecord(raw, 'workspace');
  const workspace: WorkspaceConfig = {
    root: optionalNonEmptyString(record, 'root', 'workspace', DEFAULT_WORKSPACE_ROOT),
  };
  const worktrees = record['worktrees'];
  if (worktrees !== undefined) {
    if (typeof worktrees !== 'string' || worktrees.trim() === '') {
      throw new ConfigError("workspace: 'worktrees' must be a non-empty string when provided");
    }
    workspace.worktrees = worktrees;
  }
  return workspace;
}

function parseLogging(raw: unknown): LoggingConfig {
  if (raw === undefined) return { ...DEFAULT_LOGGING };
  const record = asRecord(raw, 'logging');
  const verbose = record['verbose'];
  if (verbose !== undefined && typeof verbose !== 'boolean') {
    throw new ConfigError("logging: 'verbose' must be a boolean when provided");
  }
  return { verbose: verbose ?? DEFAULT_LOGGING.verbose };
}

/**
 * Parse and validate an orchestrator configuration object or YAML string.
 * Throws {@link ConfigError} on any structural problem.
 */
export function parseConfig(raw: unknown): OrchestratorConfig {
  const input: unknown = typeof raw === 'string' ? parseYaml(raw) : raw;
  const record = asRecord(input, 'config');

  const repositoriesRaw = record['repositories'];
  if (!Array.isArray(repositoriesRaw) || repositoriesRaw.length === 0) {
    throw new ConfigError("config: 'repositories' is required and must be a non-empty list");
  }

  const defaults = parseDefaults(record['defaults']);
  const repositories = repositoriesRaw.map((entry, index) =>
    parseRepository(entry, index, defaults),
  );
  return {
    repositories,
    limits: parseLimits(record['limits']),
    workspace: parseWorkspace(record['workspace']),
    logging: parseLogging(record['logging']),
    agent: parseAgent(record['agent']),
  };
}

/** Read and validate a configuration file (YAML or JSON). */
export function loadConfigFile(path: string): OrchestratorConfig {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`config: could not read '${path}': ${detail}`);
  }
  return parseConfig(contents);
}
