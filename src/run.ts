import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { main } from './index.js';
import { OpenCodeRuntime } from './runtime/opencode/opencode-runtime.js';
import { EmbeddedOpenCodeClient } from './runtime/opencode/sdk-client.js';
import {
  createEmbeddedHostFactory,
  type EmbedOpenCodeOptions,
} from './runtime/opencode/sdk-host.js';

export type { EmbedOpenCodeOptions } from './runtime/opencode/sdk-host.js';

/**
 * The deployable entry point: the stock CLI (`main`) with an embedded OpenCode
 * runtime supplied. Config loading, credential resolution, polling, and signal
 * handling all come from `main`; only the runtime is added here.
 *
 * OpenCode is hosted inside this process through `@opencode/sdk`, so no separate
 * OpenCode server is required. The host is created on the first turn and closed
 * when the service stops, which also lets `--once` exit cleanly.
 */
export async function run(
  argv: string[] = process.argv.slice(2),
  options: EmbedOpenCodeOptions = {},
): Promise<number> {
  const client = new EmbeddedOpenCodeClient(createEmbeddedHostFactory(options));
  try {
    return await main(argv, {
      serviceOptions: { runtime: new OpenCodeRuntime(client) },
    });
  } finally {
    await client.dispose();
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
