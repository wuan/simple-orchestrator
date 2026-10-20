import { dirname } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { OrchestratorConfig } from './config/types.js';
import { main } from './index.js';
import type { OpenCodeClient } from './runtime/opencode/client.js';
import {
  ContainerOpenCodeClient,
  EnvironmentOpenCodeClient,
} from './runtime/opencode/container-client.js';
import { OpenCodeRuntime } from './runtime/opencode/opencode-runtime.js';
import { EmbeddedOpenCodeClient } from './runtime/opencode/sdk-client.js';
import { createEmbeddedHostFactory, parseModelRef } from './runtime/opencode/sdk-host.js';
import type { AgentRuntime } from './runtime/types.js';

export { parseModelRef } from './runtime/opencode/sdk-host.js';

export interface RuntimeHandle {
  runtime: AgentRuntime;
  dispose: () => Promise<void>;
}

/** Injectable client builders, so the runtime selection is testable. */
export interface RuntimeFactoryDeps {
  createEmbedded?: (config: OrchestratorConfig) => {
    client: OpenCodeClient;
    dispose: () => Promise<void>;
  };
  createContainer?: (config: OrchestratorConfig) => OpenCodeClient;
}

/**
 * Build the in-process embedded client. The model comes from `agent.model`;
 * `agent.database` (or `OPENCODE_DB`) points the embedded host at the OpenCode
 * database that holds provider auth and model definitions.
 */
function defaultEmbedded(config: OrchestratorConfig): {
  client: OpenCodeClient;
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
  return { client, dispose: () => client.dispose() };
}

/**
 * Build the container client for repositories that configure an environment.
 * The compiled runner this process is running from is mounted read-only into
 * the container, so its path is the directory of this module.
 */
function defaultContainer(config: OrchestratorConfig): OpenCodeClient {
  const database = config.agent.database ?? process.env.OPENCODE_DB;
  return new ContainerOpenCodeClient({
    runnerDir: dirname(fileURLToPath(import.meta.url)),
    model: config.agent.model,
    ...(config.agent.agent === undefined ? {} : { agent: config.agent.agent }),
    ...(database === undefined ? {} : { database }),
  });
}

/**
 * Build the OpenCode runtime used by the service: one runtime whose client
 * routes each turn to the container client when its repository configures an
 * environment and to the embedded in-process client otherwise.
 */
export function createRuntime(
  config: OrchestratorConfig,
  deps: RuntimeFactoryDeps = {},
): RuntimeHandle {
  const embedded = (deps.createEmbedded ?? defaultEmbedded)(config);
  const container = (deps.createContainer ?? defaultContainer)(config);
  const client = new EnvironmentOpenCodeClient(embedded.client, container);
  return { runtime: new OpenCodeRuntime(client), dispose: embedded.dispose };
}

/**
 * The deployable entry point: the stock CLI (`main`) with an OpenCode runtime
 * supplied. Config loading, credential resolution, polling, and signal
 * handling all come from `main`; only the runtime is added here.
 *
 * OpenCode is hosted inside this process through `@opencode/sdk`, so no separate
 * OpenCode server is required. The host is created on the first turn and closed
 * when the service stops, which also lets `--once` exit cleanly. Repositories
 * that configure an `environment` run their turns in a container instead; that
 * client needs no teardown.
 */
export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  let handle: RuntimeHandle | undefined;
  try {
    return await main(argv, {
      serviceOptions: {
        runtimeFactory: (config) => {
          handle = createRuntime(config);
          return handle.runtime;
        },
      },
    });
  } finally {
    await handle?.dispose();
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
  try {
    process.exitCode = await run();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
