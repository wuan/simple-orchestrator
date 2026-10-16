import type { Sandbox, SandboxHandle } from '../../runtime/sandbox.js';

/** A `Sandbox` that hands out dummy workspaces without touching the disk. */
export class FakeSandbox implements Sandbox {
  readonly created: string[] = [];
  readonly disposed: string[] = [];

  async create(input: { branch: string }): Promise<SandboxHandle> {
    const workspace = `/tmp/fake-workspace-${this.created.length}-${input.branch.replace(/\W/g, '-')}`;
    this.created.push(workspace);
    return {
      workspace,
      dispose: async () => {
        this.disposed.push(workspace);
      },
    };
  }
}
