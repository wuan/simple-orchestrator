import type { LabelConfig } from '../config/types.js';
import type { WorkflowPhase } from '../domain/types.js';

const PHASE_KEYS: Record<WorkflowPhase, keyof LabelConfig> = {
  proposing: 'proposing',
  ready: 'ready',
  implementing: 'implementing',
  done: 'done',
  failed: 'failed',
};

/** The label that represents a phase. */
export function labelForPhase(labels: LabelConfig, phase: WorkflowPhase): string {
  return labels[PHASE_KEYS[phase]];
}

/** Every phase label, in lifecycle order. */
export function allPhaseLabels(labels: LabelConfig): string[] {
  return [labels.proposing, labels.ready, labels.implementing, labels.done, labels.failed];
}

/** Phase labels that mark a workflow as still in flight (for discovery). */
export function lifecycleLabels(labels: LabelConfig): string[] {
  return [labels.proposing, labels.ready, labels.implementing];
}

/** Derive the current phase from the labels present, most advanced first. */
export function phaseFromLabels(labels: LabelConfig, present: string[]): WorkflowPhase | null {
  if (present.includes(labels.implementing)) return 'implementing';
  if (present.includes(labels.ready)) return 'ready';
  if (present.includes(labels.proposing)) return 'proposing';
  if (present.includes(labels.done)) return 'done';
  if (present.includes(labels.failed)) return 'failed';
  return null;
}

/** Recover the issue number from a workflow branch name. */
export function issueNumberFromBranch(branch: string): number | null {
  const match = /^openspec\/issue-(\d+)$/.exec(branch);
  return match === null ? null : Number(match[1]);
}
