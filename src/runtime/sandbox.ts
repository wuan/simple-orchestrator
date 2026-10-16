import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RepoProvider } from '../provider/types.js';

export interface SandboxHandle {
  readonly workspace: string;
  dispose(): Promise<void>;
}

export interface Sandbox {
  create(input: { branch: string }): Promise<SandboxHandle>;
}

export interface EphemeralWorkspaceSandboxOptions {
  provider: RepoProvider;
  /** Parent directory for workspaces; defaults to the OS temp directory. */
  root?: string;
  prefix?: string;
}

/**
 * Provisions a fresh, throwaway workspace per turn by cloning the workflow
 * branch into a unique directory, and removes it when the turn ends. No two
 * turns share a workspace.
 */
export class EphemeralWorkspaceSandbox implements Sandbox {
  private readonly provider: RepoProvider;
  private readonly root: string;
  private readonly prefix: string;

  constructor(options: EphemeralWorkspaceSandboxOptions) {
    this.provider = options.provider;
    this.root = options.root ?? tmpdir();
    this.prefix = options.prefix ?? 'orchestrator-turn-';
  }

  async create(input: { branch: string }): Promise<SandboxHandle> {
    const workspace = await mkdtemp(join(this.root, this.prefix));
    try {
      await this.provider.clone({ branch: input.branch, destination: workspace });
    } catch (error) {
      await rm(workspace, { recursive: true, force: true });
      throw error;
    }

    let disposed = false;
    return {
      workspace,
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        await rm(workspace, { recursive: true, force: true });
      },
    };
  }
}

export interface DockerRunOptions {
  image: string;
  /** Host directory bind-mounted into the container. */
  workspace: string;
  containerWorkspace?: string;
  command: string[];
  /** Container network mode; defaults to `none` for isolation. */
  network?: string;
}

/**
 * Build the argv for running a command against a workspace inside a container.
 * Used to execute a turn with container-level isolation.
 */
export function buildDockerRunArgs(options: DockerRunOptions): string[] {
  const containerWorkspace = options.containerWorkspace ?? '/workspace';
  return [
    'run',
    '--rm',
    '--network',
    options.network ?? 'none',
    '--workdir',
    containerWorkspace,
    '--volume',
    `${options.workspace}:${containerWorkspace}`,
    options.image,
    ...options.command,
  ];
}
