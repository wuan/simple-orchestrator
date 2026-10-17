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

  async create(input: { branch: string }): Promise<SandboxHandle> {
    const workspace = `/tmp/fake-workspace-${this.created.length}-${input.branch.replace(/\W/g, '-')}`;
    this.created.push(workspace);
    return {
      workspace,
      baseIntegrated: async () => this.baseIntegrationResults.shift() ?? true,
      dispose: async () => {
        this.disposed.push(workspace);
      },
    };
  }
}
