import { readFileSync } from 'node:fs';

import { parse as parseYaml } from 'yaml';

import {
  DEFAULT_AGENT_MODEL,
  DEFAULT_BASE_BRANCH,
  DEFAULT_LABELS,
  DEFAULT_LIMITS,
  DEFAULT_MAX_REVISE_ROUNDS,
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEFAULT_WORKSPACE_ROOT,
  type AgentConfig,
  type LabelConfig,
  type Limits,
  type OrchestratorConfig,
  type RepositoryConfig,
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

function optionalNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  context: string,
  fallback: string,
  repo?: string,
): string {
  const value = record[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(`${context}: '${key}' must be a non-empty string when provided`, repo);
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
  const value = record[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ConfigError(`${context}: '${key}' must be a positive integer when provided`, repo);
  }
  return value;
}

function parseLabels(entry: Record<string, unknown>, context: string, repo: string): LabelConfig {
  const raw = entry['labels'];
  if (raw === undefined) return { ...DEFAULT_LABELS };
  const record = asRecord(raw, `${context}.labels`);
  const merged: LabelConfig = { ...DEFAULT_LABELS };
  for (const key of Object.keys(DEFAULT_LABELS) as (keyof LabelConfig)[]) {
    const value = record[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ConfigError(`${context}.labels: '${key}' must be a non-empty string`, repo);
    }
    merged[key] = value;
  }
  return merged;
}

function parseRepository(entry: unknown, index: number): RepositoryConfig {
  const context = `repositories[${index}]`;
  const record = asRecord(entry, context);

  const provider = requireNonEmptyString(record, 'provider', context);
  const owner = requireNonEmptyString(record, 'owner', context);
  const name = requireNonEmptyString(record, 'name', context);
  const repo = `${owner}/${name}`;

  // Required, and its absence fails fast naming the offending repository.
  const credential = requireNonEmptyString(record, 'credential', context, repo);

  const baseBranch = optionalNonEmptyString(
    record,
    'baseBranch',
    context,
    DEFAULT_BASE_BRANCH,
    repo,
  );
  const pollIntervalSeconds = optionalPositiveInt(
    record,
    'pollIntervalSeconds',
    context,
    DEFAULT_POLL_INTERVAL_SECONDS,
    repo,
  );
  const maxReviseRounds = optionalPositiveInt(
    record,
    'maxReviseRounds',
    context,
    DEFAULT_MAX_REVISE_ROUNDS,
    repo,
  );

  return {
    provider,
    owner,
    name,
    credential,
    baseBranch,
    pollIntervalSeconds,
    maxReviseRounds,
    labels: parseLabels(record, context, repo),
  };
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
  if (raw === undefined) return { model: DEFAULT_AGENT_MODEL };
  const record = asRecord(raw, 'agent');
  const agent: AgentConfig = {
    model: optionalNonEmptyString(record, 'model', 'agent', DEFAULT_AGENT_MODEL),
  };
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

  const repositories = repositoriesRaw.map((entry, index) => parseRepository(entry, index));
  return {
    repositories,
    limits: parseLimits(record['limits']),
    workspace: parseWorkspace(record['workspace']),
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
