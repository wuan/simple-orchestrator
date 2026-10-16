import process from 'node:process';
import { pathToFileURL } from 'node:url';

import type { TurnSkill } from './domain/types.js';
import { main } from './index.js';
import type {
  OpenCodeClient,
  OpenCodeSkillRequest,
  OpenCodeSkillResult,
} from './runtime/opencode/client.js';
import { OpenCodeRuntime } from './runtime/opencode/opencode-runtime.js';

/**
 * The OpenCode skill that implements each orchestrator turn skill. The
 * orchestrator asks for `propose`/`apply`; the OpenSpec skills live under
 * `.opencode/skills/`.
 */
export const SKILL_NAMES: Record<TurnSkill, string> = {
  propose: 'openspec-propose',
  apply: 'openspec-apply-change',
};

export interface OpenCodeServerClientOptions {
  /** Base URL of the OpenCode server, e.g. `http://localhost:4096`. */
  baseUrl: string;
  /** Optional bearer token for the OpenCode server. */
  token?: string;
}

/**
 * An `OpenCodeClient` backed by a live OpenCode server.
 *
 * This is the one deployment-specific piece: `runSkill` must open (or reuse) a
 * session rooted at `request.workspace`, run the mapped OpenSpec skill with
 * `request.prompt`, honor `request.signal`, relay budget through
 * `request.onUsage`, and return the structured result. Until that transport is
 * implemented it fails loudly instead of silently no-op'ing a turn.
 */
export class OpenCodeServerClient implements OpenCodeClient {
  constructor(private readonly options: OpenCodeServerClientOptions) {}

  async runSkill(request: OpenCodeSkillRequest): Promise<OpenCodeSkillResult> {
    const skill = SKILL_NAMES[request.skill];
    throw new Error(
      `OpenCodeServerClient is not wired to a server yet: run skill '${skill}' at ` +
        `'${this.options.baseUrl}' in workspace '${request.workspace}'. Implement ` +
        'OpenCodeServerClient.runSkill against your OpenCode server. See README > Agent runtime.',
    );
  }
}

/**
 * The deployable entry point: the stock CLI (`main`) with an OpenCode runtime
 * supplied. Config loading, credential resolution, polling, and signal handling
 * all come from `main`; only the runtime is added here.
 */
export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  const runtime = new OpenCodeRuntime(
    new OpenCodeServerClient({
      baseUrl: process.env.OPENCODE_URL ?? 'http://localhost:4096',
      token: process.env.OPENCODE_TOKEN,
    }),
  );
  return main(argv, { serviceOptions: { runtime } });
}

const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  run()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
