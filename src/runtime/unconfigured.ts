import type { TurnResult } from '../domain/types.js';
import type { AgentRuntime, TurnRequest } from './types.js';

/**
 * The default runtime when none is configured. It fails loudly the first time a
 * turn runs, so the service can start and poll without a configured agent, but
 * never silently no-ops a turn. See README ("Agent runtime").
 */
export class UnconfiguredRuntime implements AgentRuntime {
  readonly id = 'unconfigured';

  async run(_request: TurnRequest): Promise<TurnResult> {
    throw new Error(
      'No agent runtime is configured. Provide an AgentRuntime (for example the OpenCode adapter) in the service wiring. See README > Agent runtime.',
    );
  }
}
