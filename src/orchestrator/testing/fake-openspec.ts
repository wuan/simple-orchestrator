import type {
  OpenspecArtifact,
  OpenspecChange,
  OpenspecCli,
  OpenspecStatus,
  OpenspecValidation,
} from '../readiness.js';

/** A scriptable `OpenspecCli` for orchestration tests. */
export class FakeOpenspecCli implements OpenspecCli {
  changes: OpenspecChange[] = [];
  readonly statuses = new Map<string, OpenspecStatus>();
  readonly validations = new Map<string, OpenspecValidation>();
  readonly calls: string[] = [];

  listChanges(): Promise<OpenspecChange[]> {
    this.calls.push('list');
    return Promise.resolve(this.changes);
  }

  status(change: string): Promise<OpenspecStatus> {
    this.calls.push(`status:${change}`);
    return Promise.resolve(this.statuses.get(change) ?? { artifacts: [], isComplete: false });
  }

  validate(change: string): Promise<OpenspecValidation> {
    this.calls.push(`validate:${change}`);
    return Promise.resolve(
      this.validations.get(change) ?? { valid: false, output: 'unknown change' },
    );
  }

  /** Configure a single complete, valid change. */
  markReady(changeName: string, artifacts?: OpenspecArtifact[]): void {
    this.changes = [{ name: changeName }];
    this.statuses.set(changeName, {
      artifacts: artifacts ?? [{ id: 'proposal', status: 'done' }],
      isComplete: true,
    });
    this.validations.set(changeName, { valid: true, output: 'Change is valid' });
  }

  /** Configure a single change with an unfinished artifact. */
  markInProgress(changeName: string): void {
    this.changes = [{ name: changeName }];
    this.statuses.set(changeName, {
      artifacts: [
        { id: 'proposal', status: 'done' },
        { id: 'tasks', status: 'ready' },
      ],
      isComplete: false,
    });
    this.validations.set(changeName, { valid: false, output: 'not ready' });
  }
}
