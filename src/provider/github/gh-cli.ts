import type { CommandRunner } from '../../system/commands.js';
import {
  GitHubApiError,
  unwrapGraphql,
  type GitHubTransport,
  type JsonOptions,
  type JsonResult,
  type QueryValue,
} from './transport.js';

export interface GhCliTransportOptions {
  commands: CommandRunner;
  /** GitHub hostname for GitHub Enterprise; defaults to `github.com`. */
  hostname?: string;
  /**
   * GitHub token exported to `gh` as `GH_TOKEN`. When omitted, `gh` uses its
   * own stored authentication (e.g. from `gh auth login`).
   */
  token?: string;
  /** Base environment for `gh` invocations; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

/**
 * A `GitHubTransport` that shells out to the `gh` CLI (`gh api`). Authentication
 * is delegated to `gh` itself, so no token needs to be configured. Requests are
 * issued with `--paginate`/`--slurp` for list endpoints.
 */
export class GhCliTransport implements GitHubTransport {
  private readonly commands: CommandRunner;
  private readonly hostname: string | undefined;
  private readonly token: string | undefined;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: GhCliTransportOptions) {
    this.commands = options.commands;
    this.hostname = options.hostname;
    this.token = options.token;
    this.env = options.env ?? process.env;
  }

  private childEnv(): NodeJS.ProcessEnv {
    return this.token === undefined || this.token === ''
      ? this.env
      : { ...this.env, GH_TOKEN: this.token };
  }

  private baseArgs(): string[] {
    const args = ['api'];
    if (this.hostname !== undefined && this.hostname !== '') args.push('--hostname', this.hostname);
    return args;
  }

  private describe(method: string, path: string, stderr: string, code: number): GitHubApiError {
    const match = /(?:\(HTTP (\d+)\)|HTTP (\d+))/.exec(stderr);
    const status = match === null ? code : Number(match[1] ?? match[2]);
    const detail = stderr.trim() === '' ? `exit code ${code}` : stderr.trim();
    return new GitHubApiError(`gh api ${method} ${path} failed: ${detail}`, status);
  }

  /**
   * GitHub answers a write the credential may not perform with 404 (or 403)
   * rather than naming the missing permission, and on a public repository the
   * reads still succeed, so the bare error points nowhere. For a refused write
   * to a repository, ask `gh` what the same credential may do there and append
   * that report. The check is best effort: the original error is always kept.
   */
  private async withPermissionReport(
    error: GitHubApiError,
    method: string,
    path: string,
  ): Promise<GitHubApiError> {
    if (method.toUpperCase() === 'GET' || (error.status !== 403 && error.status !== 404)) {
      return error;
    }
    const repo = /^\/?repos\/([^/]+)\/([^/]+)/.exec(path);
    if (repo === null) return error;
    const fullName = `${repo[1]}/${repo[2]}`;

    let report: string;
    try {
      const result = await this.commands.run(
        'gh',
        [...this.baseArgs(), '--include', `/repos/${fullName}`],
        { env: this.childEnv() },
      );
      report =
        result.code === 0
          ? describePermissions(fullName, result.stdout)
          : `could not read ${fullName} with this credential (${result.stderr.trim() || `exit code ${result.code}`})`;
    } catch (cause) {
      report = `check failed (${cause instanceof Error ? cause.message : String(cause)})`;
    }
    return new GitHubApiError(`${error.message}; permission check: ${report}`, error.status);
  }

  async json<T>(method: string, path: string, options: JsonOptions = {}): Promise<JsonResult<T>> {
    const args = [...this.baseArgs(), '--method', method];
    if (options.body !== undefined) {
      args.push('--header', 'content-type: application/json', '--input', '-');
    } else if (options.query !== undefined) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) args.push('--raw-field', `${key}=${String(value)}`);
      }
    }
    args.push(path);

    const result = await this.commands.run('gh', args, {
      env: this.childEnv(),
      stdin: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    if (result.code !== 0) {
      const error = this.describe(method, path, result.stderr, result.code);
      throw await this.withPermissionReport(error, method, path);
    }

    const text = result.stdout.trim();
    const data = text === '' ? null : (JSON.parse(text) as T);
    return { status: 200, data, notModified: false };
  }

  /** Run a GraphQL query or mutation through `gh api graphql`. */
  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const args = [...this.baseArgs(), 'graphql', '--input', '-'];
    const result = await this.commands.run('gh', args, {
      env: this.childEnv(),
      stdin: JSON.stringify({ query, variables }),
    });
    if (result.code !== 0) throw this.describe('POST', '/graphql', result.stderr, result.code);
    return unwrapGraphql<T>(result.stdout, 200);
  }

  async paginate<T>(path: string, query?: Record<string, QueryValue>): Promise<T[]> {
    const args = [...this.baseArgs(), '--method', 'GET', '--paginate', '--slurp'];
    if (query !== undefined) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) args.push('--raw-field', `${key}=${String(value)}`);
      }
    }
    args.push(path);

    const result = await this.commands.run('gh', args, { env: this.childEnv() });
    if (result.code !== 0) throw this.describe('GET', path, result.stderr, result.code);

    const text = result.stdout.trim();
    if (text === '') return [];
    const slurped = JSON.parse(text) as unknown;
    if (!Array.isArray(slurped)) return slurped === null ? [] : [slurped as T];
    // With `--paginate --slurp`, each page is an element of the outer array.
    const items: T[] = [];
    for (const page of slurped) {
      if (Array.isArray(page)) items.push(...(page as T[]));
      else items.push(page as T);
    }
    return items;
  }
}

/**
 * Summarize what a credential may do on a repository from the output of
 * `gh api --include /repos/{owner}/{repo}`: the response headers, a blank line,
 * then the JSON body. The body's `permissions` is the account's role; classic
 * tokens additionally report their scopes in the `X-OAuth-Scopes` header.
 */
export function describePermissions(fullName: string, output: string): string {
  const separator = /\r?\n\r?\n/.exec(output);
  const head = separator === null ? '' : output.slice(0, separator.index);
  const body = separator === null ? output : output.slice(separator.index + separator[0].length);

  let permissions: Record<string, boolean> | undefined;
  try {
    permissions = (JSON.parse(body) as { permissions?: Record<string, boolean> }).permissions;
  } catch {
    permissions = undefined;
  }
  const scopes = /^x-oauth-scopes:[ \t]*(.*)$/im.exec(head)?.[1]?.trim();
  const scopeNote =
    scopes === undefined ? '' : ` (token scopes: ${scopes === '' ? 'none' : scopes})`;

  if (permissions === undefined) {
    return `GitHub reports no permissions for this credential on ${fullName}; it is unauthenticated or not granted this repository${scopeNote}`;
  }
  const granted = Object.entries(permissions)
    .filter(([, allowed]) => allowed)
    .map(([name]) => name);
  const roles = granted.length === 0 ? 'none' : granted.join(', ');
  if (permissions['push'] !== true) {
    return `the credential has no push access to ${fullName} (permissions: ${roles})${scopeNote}`;
  }
  const access = `the account has push access to ${fullName} (permissions: ${roles})${scopeNote}`;
  if (scopes === undefined) {
    return `${access}, so the token itself may be restricted: a fine-grained token or GitHub App needs write access to Contents and Pull requests on this repository`;
  }
  const scopeList = scopes.split(',').map((scope) => scope.trim());
  if (!scopeList.includes('repo') && !scopeList.includes('public_repo')) {
    return `${access}, but the token lacks the 'repo' scope needed to write`;
  }
  return `${access} and a token scope that allows writing, so the refusal is likely not a permission problem`;
}
