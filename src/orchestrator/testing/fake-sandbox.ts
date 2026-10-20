import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Sandbox, SandboxHandle } from '../../runtime/sandbox.js';

/**
 * A `Sandbox` that hands out dummy workspaces under a private per-instance
 * temporary directory, so the store and workspace paths are unique and
 * owner-only instead of fixed paths under a world-writable location.
 */
export class FakeSandbox implements Sandbox {
  readonly created: string[] = [];
  readonly disposed: string[] = [];
  /**
   * Results returned by each handle's `baseIntegrated()`, consumed in order;
   * when exhausted the base is reported integrated. Script a `false` to model a
   * workspace with an unresolved base merge.
   */
  baseIntegrationResults: boolean[] = [];
  /**
   * Branch tips returned by each handle's `head()`, consumed in order. When
   * exhausted, each call returns a fresh value so a turn appears to have
   * committed. Script two equal values to model a turn that committed nothing.
   */
  headResults: string[] = [];
  /**
   * Results returned by each handle's `hasChanges()`, consumed in order; when
   * exhausted the branch is reported to carry a change. Script `false` to model
   * a workflow branch with no proposal.
   */
  hasChangesResults: boolean[] = [];
  /**
   * Clusters of subjects returned by each handle's `commitSubjects()`, consumed
   * in order; when exhausted the range is reported to carry no subjects.
   */
  commitSubjectsResults: string[][] = [];
  /** The `from` value each `commitSubjects()` call was made with, in order. */
  readonly commitSubjectRanges: string[] = [];
  /** The private store path every handle reports; set when the root is created. */
  store = '';
  private headCalls = 0;
  /** The private per-instance root the store and workspaces live under. */
  private root: Promise<string> | undefined;

  private rootDir(): Promise<string> {
    this.root ??= mkdtemp(join(tmpdir(), 'orchestrator-fake-sandbox-'));
    return this.root;
  }

  async create(input: { branch: string }): Promise<SandboxHandle> {
    const root = await this.rootDir();
    const workspace = join(
      root,
      `workspace-${this.created.length}-${input.branch.replace(/\W/g, '-')}`,
    );
    this.created.push(workspace);
    this.store = join(root, 'store');
    return {
      workspace,
      store: this.store,
      head: () => Promise.resolve(this.headResults.shift() ?? `fake-head-${++this.headCalls}`),
      baseIntegrated: () => Promise.resolve(this.baseIntegrationResults.shift() ?? true),
      hasChanges: () => Promise.resolve(this.hasChangesResults.shift() ?? true),
      commitSubjects: (from: string) => {
        this.commitSubjectRanges.push(from);
        return Promise.resolve(this.commitSubjectsResults.shift() ?? []);
      },
      dispose: () => {
        this.disposed.push(workspace);
        return Promise.resolve();
      },
    };
  }
}
