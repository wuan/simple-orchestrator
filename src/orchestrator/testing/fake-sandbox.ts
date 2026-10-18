import type { Sandbox, SandboxHandle } from '../../runtime/sandbox.js';

/** A `Sandbox` that hands out dummy workspaces without touching the disk. */
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
  private headCalls = 0;

  async create(input: { branch: string }): Promise<SandboxHandle> {
    const workspace = `/tmp/fake-workspace-${this.created.length}-${input.branch.replace(/\W/g, '-')}`;
    this.created.push(workspace);
    return {
      workspace,
      store: '/tmp/fake-store',
      head: async () => this.headResults.shift() ?? `fake-head-${++this.headCalls}`,
      baseIntegrated: async () => this.baseIntegrationResults.shift() ?? true,
      hasChanges: async () => this.hasChangesResults.shift() ?? true,
      dispose: async () => {
        this.disposed.push(workspace);
      },
    };
  }
}
