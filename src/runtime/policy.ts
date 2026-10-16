/** Raised when a turn attempts an operation it is not permitted to perform. */
export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

export interface PushTarget {
  branch: string;
  protectedBranches: string[];
  force?: boolean;
}

/**
 * A turn may push only to its workflow branch: never to a protected branch and
 * never with force.
 */
export function assertPushAllowed(target: PushTarget): void {
  if (target.force === true) {
    throw new PermissionError('force-push is not permitted');
  }
  if (target.protectedBranches.includes(target.branch)) {
    throw new PermissionError(`pushing to protected branch '${target.branch}' is not permitted`);
  }
}

/** Merging is reserved for humans; an agent turn may never merge. */
export function assertMergeAllowedBy(actor: 'agent' | 'human'): void {
  if (actor === 'agent') {
    throw new PermissionError('merges are reserved for humans');
  }
}
