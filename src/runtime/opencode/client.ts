import type { TurnSkill, TurnUsage } from '../../domain/types.js';

export interface OpenCodeSkillRequest {
  skill: TurnSkill;
  workspace: string;
  prompt: string;
  signal?: AbortSignal;
  onUsage?: (usage: Partial<TurnUsage>) => void;
}

/** The fields a skill run contributes to a turn result (everything but `skill`). */
export interface OpenCodeSkillResult {
  commits: string[];
  summary: string;
  questions: string[];
  needsInput: boolean;
  agentClaimsReady: boolean;
  usage?: TurnUsage;
}

/**
 * The subset of an OpenCode server/session client the runtime needs. Kept
 * narrow so the adapter can be tested without a running server.
 */
export interface OpenCodeClient {
  runSkill(request: OpenCodeSkillRequest): Promise<OpenCodeSkillResult>;
}
