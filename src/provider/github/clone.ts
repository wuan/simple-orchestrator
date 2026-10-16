import { NodeCommandRunner, type CommandRunner } from '../../system/commands.js';
import type { CloneInput } from '../types.js';
import { GitHubApiError } from './transport.js';

/** Clones a branch into a workspace; the transport may authenticate differently. */
export interface GitHubCloner {
  clone(input: CloneInput): Promise<void>;
}

/** Path components of the repository to clone. */
interface RepoLocation {
  owner: string;
  name: string;
}

export interface TokenClonerOptions extends RepoLocation {
  token: string;
  commands?: CommandRunner;
  gitBaseUrl?: string;
}

/**
 * Clones over HTTPS with a bearer token passed through git's environment-based
 * config so the secret never appears in the process argument list.
 */
export class TokenCloner implements GitHubCloner {
  private readonly token: string;
  private readonly commands: CommandRunner;
  private readonly gitBaseUrl: string;
  private readonly owner: string;
  private readonly name: string;

  constructor(options: TokenClonerOptions) {
    this.owner = options.owner;
    this.name = options.name;
    this.token = options.token;
    this.commands = options.commands ?? new NodeCommandRunner();
    this.gitBaseUrl = options.gitBaseUrl ?? 'https://github.com';
  }

  async clone(input: CloneInput): Promise<void> {
    const url = `${this.gitBaseUrl}/${this.owner}/${this.name}.git`;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.extraheader',
      GIT_CONFIG_VALUE_0: `Authorization: Bearer ${this.token}`,
    };
    const result = await this.commands.run(
      'git',
      ['clone', '--branch', input.branch, '--single-branch', '--depth', '1', url, input.destination],
      { env },
    );
    if (result.code !== 0) {
      throw new GitHubApiError(`git clone failed (${result.code}): ${result.stderr}`, result.code);
    }
  }
}

export interface GhCliClonerOptions extends RepoLocation {
  commands?: CommandRunner;
  /** Exported to `gh` as `GH_TOKEN`; when omitted `gh` uses its stored auth. */
  token?: string;
  /** GitHub hostname for GitHub Enterprise; defaults to `github.com`. */
  hostname?: string;
  env?: NodeJS.ProcessEnv;
}

/** Clones over HTTPS through `gh repo clone`, reusing `gh`'s authentication. */
export class GhCliCloner implements GitHubCloner {
  private readonly owner: string;
  private readonly name: string;
  private readonly commands: CommandRunner;
  private readonly token: string | undefined;
  private readonly hostname: string | undefined;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: GhCliClonerOptions) {
    this.owner = options.owner;
    this.name = options.name;
    this.commands = options.commands ?? new NodeCommandRunner();
    this.token = options.token;
    this.hostname = options.hostname;
    this.env = options.env ?? process.env;
  }

  async clone(input: CloneInput): Promise<void> {
    const slug =
      this.hostname !== undefined && this.hostname !== '' && this.hostname !== 'github.com'
        ? `${this.hostname}/${this.owner}/${this.name}`
        : `${this.owner}/${this.name}`;
    const childEnv: NodeJS.ProcessEnv =
      this.token === undefined || this.token === ''
        ? this.env
        : { ...this.env, GH_TOKEN: this.token };
    const result = await this.commands.run(
      'gh',
      [
        'repo',
        'clone',
        slug,
        input.destination,
        '--',
        '--branch',
        input.branch,
        '--single-branch',
        '--depth',
        '1',
      ],
      { env: childEnv },
    );
    if (result.code !== 0) {
      throw new GitHubApiError(`gh repo clone failed (${result.code}): ${result.stderr}`, result.code);
    }
  }
}
