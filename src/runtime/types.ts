import type { Limits } from '../config/types.js';
import type { TurnContext, TurnResult, TurnUsage } from '../domain/types.js';

export interface TurnRequest {
  context: TurnContext;
  /** Directory holding the branch checkout for this turn. */
  workspace: string;
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
