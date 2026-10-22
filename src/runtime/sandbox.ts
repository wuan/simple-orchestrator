import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import {
  DEFAULT_ENVIRONMENT_NETWORK,
  DEFAULT_ENVIRONMENT_PULL,
  type EnvironmentPull,
} from '../config/types.js';
import { NodeCommandRunner, type CommandRunner, type CommandResult } from '../system/commands.js';
import { expandHome } from '../system/paths.js';
import type { RepositorySource, RepositoryStore } from './repository-store.js';

export interface SandboxHandle {
  readonly workspace: string;
  /**
   * The persistent repository clone the workspace is a worktree of. Mounted
   * into a turn container at its identical absolute path so the worktree's
   * `.git` pointer resolves.
   */
  readonly store: string;
  /**
   * The commit the workspace's branch currently points at. Read before and
   * after a turn so the orchestrator can tell whether the turn committed
   * anything, independent of any runtime self-report.
   */
  head(): Promise<string>;
  /**
   * Whether the current base branch is integrated into the workspace's branch,
   * i.e. the base tip is an ancestor of `HEAD`. A false value also means the
   * workspace holds an unresolved base merge the turn must resolve.
   */
  baseIntegrated(): Promise<boolean>;
  /**
   * Whether the workspace's branch differs from the current base branch. A
   * freshly seeded workflow branch carries no change, so a workflow left in
   * `proposing` with no changes has no proposal for a human to review.
   */
  hasChanges(): Promise<boolean>;
  /**
   * The subjects of the commits the branch gained since `from`
   * (`git log --format=%s <from>..HEAD`), so the orchestrator can read what a
   * turn committed from repository state. Throws on a git failure.
   */
  commitSubjects(from: string): Promise<string[]>;
  dispose(): Promise<void>;
}

/**
 * A turn finished without the current base branch integrated into the workflow
 * branch. Permanent: retrying the same turn cannot resolve the base, so the
 * workflow is failed and the operator is told which base is missing.
 */
export class BaseIntegrationError extends Error {
  constructor(baseBranch: string) {
    super(
      `the base branch '${baseBranch}' was not integrated into the workflow branch; resolve the base merge and commit it before the turn finishes`,
    );
    this.name = 'BaseIntegrationError';
  }
}

/**
 * The identity the orchestrator authors a clean base-integration merge commit
 * with, so the merge does not depend on a user identity being configured in the
 * repository clone.
 */
const INTEGRATION_IDENTITY = [
  '-c',
  'user.name=openspec-workflow-orchestrator',
  '-c',
  'user.email=orchestrator@localhost',
] as const;

export interface Sandbox {
  create(input: { branch: string }): Promise<SandboxHandle>;
}

export interface WorktreeSandboxOptions {
  /** Holds the persistent per-repository clone the worktree is created from. */
  store: RepositoryStore;
  /** Provides the authenticated git transport used to clone and refresh the store. */
  source: RepositorySource;
  /** Branch a workflow branches from; the store is checked out here. */
  baseBranch: string;
  /** Parent directory for worktrees; defaults to the OS temp directory. */
  root?: string;
  prefix?: string;
  commands?: CommandRunner;
}

/**
 * Provisions a fresh, throwaway workspace per turn as a git worktree of the
 * persistent repository store, checked out on the workflow branch, and removes
 * it when the turn ends. No two turns share a working tree, and the store
 * survives so the next turn does not re-clone the repository.
 */
export class WorktreeSandbox implements Sandbox {
  private readonly store: RepositoryStore;
  private readonly source: RepositorySource;
  private readonly baseBranch: string;
  private readonly root: string;
  private readonly prefix: string;
  private readonly commands: CommandRunner;

  constructor(options: WorktreeSandboxOptions) {
    this.store = options.store;
    this.source = options.source;
    this.baseBranch = options.baseBranch;
    this.root = expandHome(options.root ?? tmpdir());
    this.prefix = options.prefix ?? 'orchestrator-turn-';
    this.commands = options.commands ?? new NodeCommandRunner();
  }

  private git(args: string[]): Promise<CommandResult> {
    return this.commands.run('git', args);
  }

  /**
   * Remove any worktree that still has `branch` checked out. A turn interrupted
   * before `dispose` leaves its worktree registered on the branch, and git
   * refuses to check the same branch out in a second worktree, so without this a
   * single crashed turn would block every later turn on that workflow.
   */
  private async releaseBranch(store: string, branch: string): Promise<void> {
    const listed = await this.git(['-C', store, 'worktree', 'list', '--porcelain']);
    if (listed.code !== 0) return;
    const ref = `refs/heads/${branch}`;
    let path: string | undefined;
    for (const line of listed.stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length).trim();
      } else if (
        path !== undefined &&
        line.startsWith('branch ') &&
        line.slice('branch '.length).trim() === ref
      ) {
        // The branch registration must be reclaimed in listing order before the
        // next one is considered.
        await this.git(['-C', store, 'worktree', 'remove', '--force', path]); // NOSONAR
        path = undefined;
      }
    }
  }

  /** Whether `origin/<baseBranch>` is an ancestor of the workspace's `HEAD`. */
  private async isBaseIntegrated(workspace: string): Promise<boolean> {
    const result = await this.git([
      '-C',
      workspace,
      'merge-base',
      '--is-ancestor',
      `origin/${this.baseBranch}`,
      'HEAD',
    ]);
    return result.code === 0;
  }

  /** The commit the workspace's branch currently points at. */
  private async headSha(workspace: string): Promise<string> {
    const result = await this.git(['-C', workspace, 'rev-parse', 'HEAD']);
    if (result.code !== 0) {
      throw new Error(`git rev-parse HEAD failed (${result.code}): ${result.stderr.trim()}`);
    }
    return result.stdout.trim();
  }

  /**
   * Whether the workspace's branch differs from the current base branch. `git
   * diff --quiet` exits 1 when there is a difference between the two trees and
   * 0 when they match; anything else is a real failure.
   */
  private async branchHasChanges(workspace: string): Promise<boolean> {
    const result = await this.git([
      '-C',
      workspace,
      'diff',
      '--quiet',
      `origin/${this.baseBranch}`,
      'HEAD',
    ]);
    if (result.code === 0) return false;
    if (result.code === 1) return true;
    throw new Error(`git diff failed (${result.code}): ${result.stderr.trim()}`);
  }

  /** Unmerged paths left behind by a conflicted merge (`git status --porcelain`). */
  private async hasUnmergedPaths(workspace: string): Promise<boolean> {
    const status = await this.git(['-C', workspace, 'status', '--porcelain']);
    return status.stdout.split('\n').some((line) => /^(DD|AU|UD|UA|DU|AA|UU) /.test(line));
  }

  /** The subjects of the commits the branch gained since `from`, newest first. */
  private async commitSubjectsIn(workspace: string, from: string): Promise<string[]> {
    const result = await this.git(['-C', workspace, 'log', '--format=%s', `${from}..HEAD`]);
    if (result.code !== 0) {
      throw new Error(`git log failed (${result.code}): ${result.stderr.trim()}`);
    }
    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
  }

  /**
   * Merge the current base branch into the workflow branch before the turn. A
   * clean merge is committed (or fast-forwards); a conflicted merge is left
   * unresolved in the workspace for the turn to resolve, rather than failing
   * provisioning. Does nothing when the base is already integrated.
   */
  private async integrateBase(workspace: string): Promise<void> {
    const base = `origin/${this.baseBranch}`;
    if (await this.isBaseIntegrated(workspace)) return;
    const merge = await this.git([
      '-C',
      workspace,
      ...INTEGRATION_IDENTITY,
      'merge',
      '--no-edit',
      base,
    ]);
    if (merge.code === 0 || (await this.hasUnmergedPaths(workspace))) return;
    throw new Error(
      `integrating the base branch '${this.baseBranch}' failed (${merge.code}): ${merge.stderr.trim()}`,
    );
  }

  async create(input: { branch: string }): Promise<SandboxHandle> {
    const store = await this.store.ensure({ baseBranch: this.baseBranch, source: this.source });
    const base = await mkdtemp(join(this.root, this.prefix));
    const workspace = join(base, 'worktree');
    try {
      // Reclaim the branch from a crashed turn, then drop any stale registration
      // before adding a fresh worktree.
      await this.releaseBranch(store, input.branch);
      await this.git(['-C', store, 'worktree', 'prune']);
      const added = await this.git([
        '-C',
        store,
        'worktree',
        'add',
        '--track',
        '-B',
        input.branch,
        workspace,
        `origin/${input.branch}`,
      ]);
      if (added.code !== 0) {
        throw new Error(`git worktree add failed (${added.code}): ${added.stderr.trim()}`);
      }
      // Bring the workspace onto the current base before the turn runs. A
      // conflict is deliberately left in place for the turn to resolve.
      await this.integrateBase(workspace);
    } catch (error) {
      await rm(base, { recursive: true, force: true });
      throw error;
    }

    let disposed = false;
    return {
      workspace,
      store,
      head: () => this.headSha(workspace),
      baseIntegrated: () => this.isBaseIntegrated(workspace),
      hasChanges: () => this.branchHasChanges(workspace),
      commitSubjects: (from: string) => this.commitSubjectsIn(workspace, from),
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        // Tolerate a missing registration or already-deleted branch; the temp
        // directory removal below is the guaranteed cleanup.
        await this.git(['-C', store, 'worktree', 'remove', '--force', workspace]);
        await this.git(['-C', store, 'branch', '-D', input.branch]);
        await this.git(['-C', store, 'worktree', 'prune']);
        await rm(base, { recursive: true, force: true });
      },
    };
  }
}

/** A named cache volume mounted into a turn container at an absolute path. */
export interface DockerCacheMount {
  /** Fully-resolved named volume; the caller scopes it per repository. */
  volume: string;
  /** Absolute path inside the container the volume is mounted at. */
  path: string;
}

export interface DockerRunOptions {
  image: string;
  /** Host path of the turn's worktree, bind-mounted at the identical path. */
  workspace: string;
  /** Host path of the repository store, bind-mounted at the identical path. */
  store: string;
  /** Host directory holding the compiled turn runner, bind-mounted read-only. */
  runner: string;
  /** Absolute path the runner directory is mounted at inside the container. */
  runnerMount: string;
  command: string[];
  /** Container network mode; defaults to {@link DEFAULT_ENVIRONMENT_NETWORK}. */
  network?: string;
  /** Image-refresh policy; defaults to {@link DEFAULT_ENVIRONMENT_PULL}. */
  pull?: EnvironmentPull;
  /** uid:gid the container runs as; defaults to the orchestrator process. */
  user?: string;
  /** Writable home directory inside the container; defaults to `/tmp`. */
  home?: string;
  /** Names of the orchestrator's environment variables passed into the container. */
  env?: string[];
  /** Named cache volumes reused across the repository's turns. */
  caches?: DockerCacheMount[];
  /** Git author/committer identity for commits made in the container. */
  gitIdentity?: { name: string; email: string };
}

/**
 * Build the argv for running the turn runner against a workspace inside a
 * container. The store and the worktree are mounted at their identical absolute
 * host paths so the worktree's `.git` pointer resolves, and the compiled runner
 * is mounted read-only so a turn cannot modify orchestrator code.
 */
export function buildDockerRunArgs(options: DockerRunOptions): string[] {
  const network = options.network ?? DEFAULT_ENVIRONMENT_NETWORK;
  const pull = options.pull ?? DEFAULT_ENVIRONMENT_PULL;
  const user = options.user ?? `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`;
  const home = options.home ?? '/tmp';
  const args = [
    'run',
    '--rm',
    '-i',
    '--pull',
    pull,
    '--network',
    network,
    '--user',
    user,
    '--env',
    `HOME=${home}`,
  ];
  for (const name of options.env ?? []) args.push('--env', name);
  if (options.gitIdentity !== undefined) {
    const { name, email } = options.gitIdentity;
    args.push(
      '--env',
      `GIT_AUTHOR_NAME=${name}`,
      '--env',
      `GIT_AUTHOR_EMAIL=${email}`,
      '--env',
      `GIT_COMMITTER_NAME=${name}`,
      '--env',
      `GIT_COMMITTER_EMAIL=${email}`,
    );
  }
  args.push(
    '--workdir',
    options.workspace,
    '--volume',
    `${options.store}:${options.store}`,
    '--volume',
    `${options.workspace}:${options.workspace}`,
    '--volume',
    `${options.runner}:${options.runnerMount}:ro`,
  );
  for (const cache of options.caches ?? []) {
    args.push('--volume', `${cache.volume}:${cache.path}`);
  }
  args.push(options.image, ...options.command);
  return args;
}

/** A cache volume to make writable by the turn user before a turn runs. */
export interface DockerCachePrepareOptions {
  image: string;
  /** Named volume to prepare. */
  volume: string;
  /** Absolute path inside the container the volume is mounted at. */
  path: string;
  /** uid:gid the volume should be usable by; defaults to the orchestrator process. */
  user?: string;
}

/**
 * Build the argv that makes a named cache volume writable by the turn user. A
 * named volume is created root-owned, and a turn runs as the orchestrator's
 * (non-root) user, so an image that does not pre-create the cache path leaves
 * the turn unable to write it and the cache never warms. Running `chown` as
 * root over the mounted path once fixes the ownership; only the mount point is
 * changed because the turn's later writes are already owned correctly.
 */
export function buildCachePrepareArgs(options: DockerCachePrepareOptions): string[] {
  const user = options.user ?? `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`;
  return [
    'run',
    '--rm',
    '--user',
    '0:0',
    '--volume',
    `${options.volume}:${options.path}`,
    '--entrypoint',
    'chown',
    options.image,
    user,
    options.path,
  ];
}
