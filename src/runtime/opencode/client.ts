import type { EnvironmentSpec } from '../../config/types.js';
import type { RepoRef, TurnSkill, TurnUsage } from '../../domain/types.js';

export interface OpenCodeSkillRequest {
  skill: TurnSkill;
  workspace: string;
  prompt: string;
  /** Repository the turn belongs to; scopes container cache volumes. */
  repo?: RepoRef;
  /** Repository store path, mounted alongside the workspace for container turns. */
  store?: string;
  /** Container environment for the turn; in-process when omitted. */
  environment?: EnvironmentSpec;
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
