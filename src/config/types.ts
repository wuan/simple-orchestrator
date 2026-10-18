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

/** A named cache volume mounted into a repository's turn container. */
export interface EnvironmentCache {
  /** Volume name; the orchestrator scopes it per repository at run time. */
  name: string;
  /** Absolute path inside the container the volume is mounted at. */
  path: string;
}

/** The git author and committer identity a containerized turn commits with. */
export interface EnvironmentGitIdentity {
  name: string;
  email: string;
}

/**
 * A per-repository execution environment: a container image the turn runs in,
 * so an agent can use a toolchain (Android, JDK, Rust, ...) the host does not
 * carry. Only `image` is required; the rest default to a documented policy.
 */
export interface EnvironmentSpec {
  /** Container image providing the turn's toolchain. */
  image: string;
  /** Container network mode; defaults to {@link DEFAULT_ENVIRONMENT_NETWORK}. */
  network?: string;
  /** Names of the orchestrator's environment variables passed into the container. */
  env?: string[];
  /** Git identity the container's commits use; required for a commit to succeed. */
  gitIdentity?: EnvironmentGitIdentity;
  /** Named cache volumes reused across the repository's turns. */
  caches?: EnvironmentCache[];
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
  /** Runs the repository's turns in a container when set; in-process when omitted. */
  environment?: EnvironmentSpec;
}

/**
 * The fields a top-level `defaults` block may supply for repository entries that
 * omit them: every {@link RepositoryConfig} field except `name`, all optional.
 * `name` is the repository's identity, so it is never defaulted. Deriving the
 * shape from `RepositoryConfig` keeps the two in step as fields are added.
 */
export type RepositoryDefaults = Partial<
  Omit<RepositoryConfig, 'name' | 'labels' | 'environment'>
> & {
  /** Label name overrides, merged key by key beneath each entry. */
  labels?: Partial<LabelConfig>;
  /** A partial environment merged field by field beneath each entry's own. */
  environment?: Partial<EnvironmentSpec>;
};

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

/**
 * Default container network mode: the model loop runs inside the container, so
 * the default must allow the provider's API to be reached. `none` would make a
 * turn unable to call the model.
 */
export const DEFAULT_ENVIRONMENT_NETWORK = 'bridge';
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
