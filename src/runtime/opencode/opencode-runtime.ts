import type { TurnContext, TurnResult } from '../../domain/types.js';
import type { AgentRuntime, TurnRequest } from '../types.js';
import type { OpenCodeClient } from './client.js';

const SKILL_INSTRUCTIONS: Record<TurnContext['skill'], string> = {
  propose:
    'Create or revise the OpenSpec change so it is ready for development. Answer the reviewer feedback above, ask any questions you still have, and keep the change artifacts coherent.',
  apply:
    'Implement the change tasks, then run `openspec archive` and include the archived change, the updated code, and the updated specs in your commit.',
};

/**
 * Compose the instruction handed to the agent for a turn. The agent is told to
 * commit only to the current branch and to report a structured outcome.
 */
export function buildSkillPrompt(context: TurnContext): string {
  const changeLine = context.changeName === undefined ? '' : ` for change \`${context.changeName}\``;
  const feedback =
    context.pendingFeedback.length === 0
      ? '(no new reviewer feedback)'
      : context.pendingFeedback.map((event) => `- ${event.kind} by ${event.actor.login}`).join('\n');

  return [
    `You are running the OpenSpec \`${context.skill}\` workflow${changeLine} on branch \`${context.branch}\`.`,
    SKILL_INSTRUCTIONS[context.skill],
    '',
    'New reviewer feedback to address:',
    feedback,
    '',
    'Constraints:',
    '- Commit all work to the current branch only. Never push to another branch and never merge.',
    '- Follow the OpenSpec workflow and validate the change before declaring it ready.',
    '',
    'Report a short summary, any questions for the human, the commit SHAs produced, and whether you need input.',
  ].join('\n');
}

/** Runs OpenSpec skills through an OpenCode client. */
export class OpenCodeRuntime implements AgentRuntime {
  readonly id = 'opencode';

  constructor(private readonly client: OpenCodeClient) {}

  async run(request: TurnRequest): Promise<TurnResult> {
    const prompt = buildSkillPrompt(request.context);
    const result = await this.client.runSkill({
      skill: request.context.skill,
      workspace: request.workspace,
      prompt,
      signal: request.signal,
      onUsage: request.onUsage,
    });
    return { skill: request.context.skill, ...result };
  }
}
