import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { RepoRef } from '../domain/types.js';
import type { CloneInput, FetchInput } from '../provider/types.js';
import { expandHome } from '../system/paths.js';

/**
 * The git operations the store needs from a repository host. A `RepoProvider`
 * satisfies this shape; tests can supply a local implementation.
 */
export interface RepositorySource {
  readonly repo: RepoRef;
  clone(input: CloneInput): Promise<void>;
  fetch(input: FetchInput): Promise<void>;
}

export interface RepositoryStoreOptions {
  /** Root for persistent clones, at `<root>/<owner>/<name>`. Defaults to `~/workspace`. */
  root?: string;
}

/**
 * Holds one persistent clone per repository so turns reuse a single checkout
 * instead of re-cloning. The clone is created on first use and refreshed before
 * every later turn; it is never the host's source of truth, only a cache of the
 * repository's branches.
 */
export class RepositoryStore {
  private readonly root: string;

  constructor(options: RepositoryStoreOptions = {}) {
    this.root = expandHome(options.root ?? '~/workspace');
  }

  /** The persistent path for a repository: `<root>/<owner>/<name>`. */
  pathFor(repo: RepoRef): string {
    return join(this.root, repo.owner, repo.name);
  }

  /**
   * Ensure a current clone exists for the source's repository and return its
   * path. The first call clones the base branch (full history, all branches);
   * later calls refresh the existing clone.
   */
  async ensure(input: { baseBranch: string; source: RepositorySource }): Promise<string> {
    const path = this.pathFor(input.source.repo);
    if (!existsSync(path)) {
      await mkdir(dirname(path), { recursive: true });
      try {
        await input.source.clone({ branch: input.baseBranch, destination: path, full: true });
      } catch (error) {
        await rm(path, { recursive: true, force: true });
        throw error;
      }
    } else {
      await input.source.fetch({ destination: path });
    }
    return path;
  }
}
