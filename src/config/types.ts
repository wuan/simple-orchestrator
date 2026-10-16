/**
 * Configuration model for the single-tenant orchestrator.
 *
 * Configuration is declarative: a list of repositories, each with a provider,
 * a credential *reference* (never a secret value), and optional overrides.
 */

export interface LabelConfig {
  /** Applied to an issue to opt it into the workflow. */
  trigger: string;
  proposing: string;
  ready: string;
  implementing: string;
  done: string;
  failed: string;
}

export interface Limits {
  maxSteps: number;
  maxTokens: number;
  maxDurationMs: number;
}

export interface RepositoryConfig {
  provider: string;
  owner: string;
  name: string;
  /** A reference such as `env:GITHUB_TOKEN`, never a secret value. */
  credential: string;
  baseBranch: string;
  pollIntervalSeconds: number;
  maxReviseRounds: number;
  labels: LabelConfig;
}

export interface WorkspaceConfig {
  /** Root for persistent per-repository clones, at `<root>/<owner>/<name>`. */
  root: string;
  /** Parent directory for ephemeral per-turn worktrees; defaults to the OS temp directory. */
  worktrees?: string;
}

export interface LoggingConfig {
  /** When true, emit verbose per-poll-cycle and per-turn diagnostics. */
  verbose: boolean;
}

export interface AgentConfig {
  /** OpenCode model in `provider/model` (or `provider/model#variant`) form. */
  model: string;
  /** OpenCode agent to run; the host's default when omitted. */
  agent?: string;
  /** OpenCode database holding provider auth and model definitions; the SDK default when omitted. */
  database?: string;
}

export interface OrchestratorConfig {
  repositories: RepositoryConfig[];
  limits: Limits;
  workspace: WorkspaceConfig;
  logging: LoggingConfig;
  agent: AgentConfig;
}

export const DEFAULT_LABELS: LabelConfig = {
  trigger: 'openspec',
  proposing: 'openspec:proposing',
  ready: 'openspec:ready',
  implementing: 'openspec:implementing',
  done: 'openspec:done',
  failed: 'openspec:failed',
};

export const DEFAULT_BASE_BRANCH = 'main';
export const DEFAULT_POLL_INTERVAL_SECONDS = 30;
export const DEFAULT_MAX_REVISE_ROUNDS = 3;

/** Root for persistent repository clones; `~` is expanded at runtime. */
export const DEFAULT_WORKSPACE_ROOT = '~/workspace';

/**
 * The OpenCode model an embedded host uses by default. The SDK's own default is
 * a free-tier model that refuses non-CLI clients, so the orchestrator names a
 * model explicitly and lets operators override it.
 */
export const DEFAULT_AGENT_MODEL = 'greenpt/deepseek-v4.1-flash';

export const DEFAULT_LIMITS: Limits = {
  maxSteps: 200,
  maxTokens: 200_000,
  maxDurationMs: 30 * 60 * 1000,
};

/** Verbose diagnostics are off unless the operator opts in. */
export const DEFAULT_LOGGING: LoggingConfig = {
  verbose: false,
};

/** Stable identifier for a configured repository. */
export function repoKey(repo: Pick<RepositoryConfig, 'provider' | 'owner' | 'name'>): string {
  return `${repo.provider}:${repo.owner}/${repo.name}`;
}
