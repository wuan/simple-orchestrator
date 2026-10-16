import type { CommandRunner } from '../../system/commands.js';
import {
  GitHubApiError,
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
    if (result.code !== 0) throw this.describe(method, path, result.stderr, result.code);

    const text = result.stdout.trim();
    const data = text === '' ? null : (JSON.parse(text) as T);
    return { status: 200, data, notModified: false };
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
