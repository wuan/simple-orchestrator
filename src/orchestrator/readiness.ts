import type { CommandRunner } from '../system/commands.js';

export interface OpenspecChange {
  name: string;
}

export interface OpenspecArtifact {
  id: string;
  status: string;
}

export interface OpenspecStatus {
  artifacts: OpenspecArtifact[];
  isComplete: boolean;
}

export interface OpenspecValidation {
  valid: boolean;
  output: string;
}

/** The OpenSpec operations the readiness predicate needs. */
export interface OpenspecCli {
  listChanges(cwd: string): Promise<OpenspecChange[]>;
  status(change: string, cwd: string): Promise<OpenspecStatus>;
  validate(change: string, cwd: string): Promise<OpenspecValidation>;
}

export interface ReadinessResult {
  ready: boolean;
  changeName?: string;
  reason: string;
}

/**
 * The objective readiness predicate: a change is ready when it is the only
 * active change, every artifact is `done`, and strict validation passes. Agent
 * self-reports are never consulted.
 */
export async function evaluateReadiness(cli: OpenspecCli, cwd: string): Promise<ReadinessResult> {
  const changes = await cli.listChanges(cwd);
  if (changes.length === 0) return { ready: false, reason: 'no active change found' };
  if (changes.length > 1) {
    return { ready: false, reason: `${changes.length} active changes found; expected exactly one` };
  }

  const changeName = changes[0]?.name;
  if (changeName === undefined) return { ready: false, reason: 'active change has no name' };

  const status = await cli.status(changeName, cwd);
  if (status.artifacts.length === 0) {
    return { ready: false, changeName, reason: 'change has no artifacts' };
  }
  const unfinished = status.artifacts.filter((artifact) => artifact.status !== 'done');
  if (unfinished.length > 0) {
    return { ready: false, changeName, reason: `${unfinished.length} artifact(s) not done` };
  }

  const validation = await cli.validate(changeName, cwd);
  if (!validation.valid) {
    return { ready: false, changeName, reason: 'strict validation failed' };
  }
  return { ready: true, changeName, reason: 'change is complete and valid' };
}

/** `OpenspecCli` backed by the `openspec` binary. */
export class NodeOpenspecCli implements OpenspecCli {
  constructor(
    private readonly commands: CommandRunner,
    private readonly binary = 'openspec',
  ) {}

  async listChanges(cwd: string): Promise<OpenspecChange[]> {
    const result = await this.commands.run(this.binary, ['list', '--json'], { cwd });
    if (result.code !== 0) {
      throw new Error(`openspec list failed in ${cwd}: ${result.stderr || result.stdout}`);
    }
    const parsed = JSON.parse(result.stdout) as { changes?: { name: string }[] };
    return (parsed.changes ?? []).map((change) => ({ name: change.name }));
  }

  async status(change: string, cwd: string): Promise<OpenspecStatus> {
    const result = await this.commands.run(
      this.binary,
      ['status', '--change', change, '--json'],
      { cwd },
    );
    if (result.code !== 0) {
      throw new Error(`openspec status failed for '${change}': ${result.stderr || result.stdout}`);
    }
    const parsed = JSON.parse(result.stdout) as {
      artifacts?: { id: string; status: string }[];
      isComplete?: boolean;
    };
    return { artifacts: parsed.artifacts ?? [], isComplete: parsed.isComplete ?? false };
  }

  async validate(change: string, cwd: string): Promise<OpenspecValidation> {
    const result = await this.commands.run(this.binary, ['validate', change, '--strict'], { cwd });
    return { valid: result.code === 0, output: `${result.stdout}${result.stderr}`.trim() };
  }
}
