import { repoKey, type OrchestratorConfig } from './types.js';

/** Thrown when a credential reference cannot be resolved. */
export class CredentialError extends Error {
  readonly repo?: string;

  constructor(message: string, repo?: string) {
    super(message);
    this.name = 'CredentialError';
    if (repo !== undefined) this.repo = repo;
  }
}

export interface CredentialContext {
  repo: string;
}

/** Resolves a credential *reference* (e.g. `env:GITHUB_TOKEN`) to a secret. */
export interface CredentialResolver {
  resolve(reference: string, context: CredentialContext): string;
}

/**
 * Resolves credentials from the process environment. Secrets are never read
 * from the configuration file itself, so a config can be committed safely.
 */
export class EnvCredentialResolver implements CredentialResolver {
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  resolve(reference: string, context: CredentialContext): string {
    const separator = reference.indexOf(':');
    if (separator < 0) {
      throw new CredentialError(
        `credential reference '${reference}' must use the form 'scheme:name'`,
        context.repo,
      );
    }
    const scheme = reference.slice(0, separator);
    const name = reference.slice(separator + 1);
    if (scheme !== 'env') {
      throw new CredentialError(
        `unsupported credential scheme '${scheme}' (only 'env' is supported) in reference '${reference}'`,
        context.repo,
      );
    }
    const value = this.env[name];
    if (typeof value !== 'string' || value === '') {
      throw new CredentialError(
        `credential '${reference}' for repository '${context.repo}' is not set in the environment`,
        context.repo,
      );
    }
    return value;
  }
}

/** Resolve every repository credential, keyed by `repoKey`. */
export function resolveCredentials(
  config: OrchestratorConfig,
  resolver: CredentialResolver,
): Map<string, string> {
  const resolved = new Map<string, string>();
  for (const repo of config.repositories) {
    const key = repoKey(repo);
    resolved.set(key, resolver.resolve(repo.credential, { repo: key }));
  }
  return resolved;
}
