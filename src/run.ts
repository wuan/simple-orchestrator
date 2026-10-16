import process from 'node:process';
import { pathToFileURL } from 'node:url';

import type { OrchestratorConfig } from './config/types.js';
import { main } from './index.js';
import { OpenCodeRuntime } from './runtime/opencode/opencode-runtime.js';
import { EmbeddedOpenCodeClient } from './runtime/opencode/sdk-client.js';
import { createEmbeddedHostFactory, parseModelRef } from './runtime/opencode/sdk-host.js';

export { parseModelRef } from './runtime/opencode/sdk-host.js';

/**
 * Build the embedded OpenCode runtime from configuration. The model comes from
 * `agent.model`; `agent.database` (or `OPENCODE_DB`) points the embedded host at
 * the OpenCode database that holds provider auth and model definitions, which
 * the SDK's in-memory default does not have.
 */
function embeddedRuntime(config: OrchestratorConfig): {
  runtime: OpenCodeRuntime;
  dispose: () => Promise<void>;
} {
  const model = parseModelRef(config.agent.model);
  const database = config.agent.database ?? process.env.OPENCODE_DB;
  const client = new EmbeddedOpenCodeClient(
    createEmbeddedHostFactory(database === undefined ? {} : { database }),
    {
      ...(model === undefined ? {} : { model }),
      ...(config.agent.agent === undefined ? {} : { agent: config.agent.agent }),
    },
  );
  return { runtime: new OpenCodeRuntime(client), dispose: () => client.dispose() };
}

/**
 * The deployable entry point: the stock CLI (`main`) with an embedded OpenCode
 * runtime supplied. Config loading, credential resolution, polling, and signal
 * handling all come from `main`; only the runtime is added here.
 *
 * OpenCode is hosted inside this process through `@opencode/sdk`, so no separate
 * OpenCode server is required. The host is created on the first turn and closed
 * when the service stops, which also lets `--once` exit cleanly.
 */
export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  let dispose: (() => Promise<void>) | undefined;
  try {
    return await main(argv, {
      serviceOptions: {
        runtimeFactory: (config) => {
          const embedded = embeddedRuntime(config);
          dispose = embedded.dispose;
          return embedded.runtime;
        },
      },
    });
  } finally {
    await dispose?.();
  }
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
