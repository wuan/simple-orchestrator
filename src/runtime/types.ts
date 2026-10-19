import type { EnvironmentSpec, Limits } from '../config/types.js';
import type { TurnContext, TurnResult, TurnUsage } from '../domain/types.js';

export interface TurnRequest {
  context: TurnContext;
  /** Directory holding the branch checkout for this turn. */
  workspace: string;
  /**
   * Persistent repository clone the workspace is a worktree of. Carried so a
   * container runtime can mount it at the same absolute path as the workspace.
   */
  store?: string;
  /**
   * Container environment the repository's turns run in. Omitted (or absent)
   * means the turn runs in-process.
   */
  environment?: EnvironmentSpec;
  limits: Limits;
  /** Aborted when a limit is exceeded, so a runtime should stop promptly. */
  signal?: AbortSignal;
  /** Called by the runtime as it consumes budget. */
  onUsage?: (usage: Partial<TurnUsage>) => void;
}

/**
 * Executes exactly one OpenSpec skill for one turn. Implementations are
 * interchangeable so a runtime can be added without touching orchestration.
 */
export interface AgentRuntime {
  readonly id: string;
  run(request: TurnRequest): Promise<TurnResult>;
}

export type { Limits };
