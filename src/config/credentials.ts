import type { CommandRunner } from '../system/commands.js';
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
  resolve(reference: string, context: CredentialContext): Promise<string>;
}

function parseReference(
  reference: string,
  context: CredentialContext,
): { scheme: string; name: string } {
  const separator = reference.indexOf(':');
  if (separator < 0) {
    throw new CredentialError(
      `credential reference '${reference}' must use the form 'scheme:name'`,
      context.repo,
    );
  }
  return { scheme: reference.slice(0, separator), name: reference.slice(separator + 1) };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

  resolve(reference: string, context: CredentialContext): Promise<string> {
    return Promise.resolve().then(() => this.resolveEnv(reference, context));
  }

  /** The synchronous lookup, wrapped by `resolve` into a promise. */
  private resolveEnv(reference: string, context: CredentialContext): string {
    const { scheme, name } = parseReference(reference, context);
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

export interface GhCredentialResolverOptions {
  commands: CommandRunner;
  /** GitHub hostname for GitHub Enterprise; defaults to `github.com`. */
  hostname?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Resolves a credential from the `gh` CLI by running `gh auth token`. Accepts
 * the `gh:` scheme and, as a fallback, `env:` references (so an unset
 * `env:GITHUB_TOKEN` still works when `gh` is authenticated).
 */
export class GhCredentialResolver implements CredentialResolver {
  private readonly commands: CommandRunner;
  private readonly hostname: string | undefined;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: GhCredentialResolverOptions) {
    this.commands = options.commands;
    this.hostname = options.hostname;
    this.env = options.env ?? process.env;
  }

  async resolve(reference: string, context: CredentialContext): Promise<string> {
    const { scheme } = parseReference(reference, context);
    if (scheme !== 'gh' && scheme !== 'env') {
      throw new CredentialError(
        `unsupported credential scheme '${scheme}' (only 'env' and 'gh' are supported) in reference '${reference}'`,
        context.repo,
      );
    }

    const args = ['auth', 'token'];
    if (this.hostname !== undefined && this.hostname !== '') args.push('--hostname', this.hostname);

    let result;
    try {
      result = await this.commands.run('gh', args, { env: this.env });
    } catch (error) {
      throw new CredentialError(
        `credential '${reference}' for repository '${context.repo}' could not be read from the gh CLI (${message(error)}); run 'gh auth login' or set the referenced environment variable`,
        context.repo,
      );
    }

    const token = result.stdout.trim();
    if (result.code !== 0 || token === '') {
      const detail =
        result.stderr.trim() === '' ? `exit code ${result.code}` : result.stderr.trim();
      throw new CredentialError(
        `credential '${reference}' for repository '${context.repo}' is not available from the gh CLI (${detail}); run 'gh auth login' or set the referenced environment variable`,
        context.repo,
      );
    }
    return token;
  }
}

/**
 * Tries each resolver in order and returns the first secret. A reference is
 * only considered unresolved once every resolver has failed, so an unset
 * environment variable can fall back to another source such as the `gh` CLI.
 */
export class FallbackCredentialResolver implements CredentialResolver {
  private readonly resolvers: CredentialResolver[];

  constructor(resolvers: CredentialResolver[]) {
    if (resolvers.length === 0) {
      throw new Error('FallbackCredentialResolver requires at least one resolver');
    }
    this.resolvers = resolvers;
  }

  async resolve(reference: string, context: CredentialContext): Promise<string> {
    const errors: CredentialError[] = [];
    // Resolvers are tried in priority order, so the awaits stay sequential.
    for (const resolver of this.resolvers) {
      try {
        return await resolver.resolve(reference, context); // NOSONAR
      } catch (error) {
        if (error instanceof CredentialError) {
          errors.push(error);
          continue;
        }
        throw error;
      }
    }
    throw new CredentialError(
      `credential '${reference}' for repository '${context.repo}' could not be resolved (${errors
        .map((error) => error.message)
        .join('; ')})`,
      context.repo,
    );
  }
}

/** Resolve every repository credential, keyed by `repoKey`. */
export async function resolveCredentials(
  config: OrchestratorConfig,
  resolver: CredentialResolver,
): Promise<Map<string, string>> {
  // Repository credentials are independent, so resolve them concurrently while
  // preserving the configured repository order in the result.
  const entries = await Promise.all(
    config.repositories.map(async (repo) => {
      const key = repoKey(repo);
      const credential = await resolver.resolve(repo.credential, { repo: key });
      return [key, credential] as const;
    }),
  );
  return new Map(entries);
}
