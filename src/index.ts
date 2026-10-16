import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { EnvCredentialResolver } from './config/credentials.js';
import { loadConfigFile } from './config/loader.js';
import { createService, type BuildServiceOptions, type Service } from './service.js';
import { VERSION } from './version.js';

const USAGE = `openspec-workflow-orchestrator ${VERSION}

Usage:
  orchestrator --config <path> [--once]

Options:
  --config <path>   Path to the YAML/JSON configuration file (required).
  --once            Run a single poll cycle for every repository, then exit.
  -h, --help        Show this help.

The service polls configured repositories (outbound only) and drives OpenSpec
changes from issues through propose, review, approval, and apply.`;

export interface CliOptions {
  config?: string;
  once: boolean;
  help: boolean;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = { once: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--config': {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('-')) {
          throw new Error("'--config' requires a path");
        }
        options.config = value;
        index += 1;
        break;
      }
      case '--once':
        options.once = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`unknown argument '${arg ?? ''}'`);
    }
  }
  return options;
}

export interface MainDeps {
  env?: NodeJS.ProcessEnv;
  serviceOptions?: Partial<BuildServiceOptions>;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

/** Parse arguments, load config, build the service, and run it. */
export async function main(argv: string[], deps: MainDeps = {}): Promise<number> {
  const out = deps.stdout ?? ((text: string) => process.stdout.write(text));
  const err = deps.stderr ?? ((text: string) => process.stderr.write(text));

  let options: CliOptions;
  try {
    options = parseCliArgs(argv);
  } catch (error) {
    err(`${message(error)}\n${USAGE}\n`);
    return 2;
  }

  if (options.help) {
    out(`${USAGE}\n`);
    return 0;
  }
  if (options.config === undefined) {
    err(`'--config' is required\n${USAGE}\n`);
    return 2;
  }

  let config;
  try {
    config = loadConfigFile(options.config);
  } catch (error) {
    err(`configuration error: ${message(error)}\n`);
    return 1;
  }

  let service: Service;
  try {
    service = createService(config, {
      credentials: new EnvCredentialResolver(deps.env ?? process.env),
      ...deps.serviceOptions,
    });
  } catch (error) {
    err(`startup error: ${message(error)}\n`);
    return 1;
  }

  if (options.once) {
    for (const repository of service.repositories) {
      const report = await repository.poller.pollOnce();
      out(`${repository.key}: started ${report.started.length}, actions ${report.actions.length}\n`);
    }
    return 0;
  }

  await runLoop(service, deps);
  return 0;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

const TICK_MS = 1000;

/** Poll each repository on its own interval until interrupted. */
export async function runLoop(service: Service, deps: MainDeps = {}): Promise<void> {
  const err = deps.stderr ?? ((text: string) => process.stderr.write(text));
  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  const due = new Map<string, number>(service.repositories.map((repo) => [repo.key, 0]));

  try {
    while (!controller.signal.aborted) {
      for (const repository of service.repositories) {
        if (Date.now() < (due.get(repository.key) ?? 0)) continue;
        due.set(repository.key, Date.now() + repository.intervalSeconds * 1000);
        try {
          const report = await repository.poller.pollOnce();
          if (report.started.length > 0 || report.actions.length > 0) {
            err(`${repository.key}: started ${report.started.length}, actions ${report.actions.length}\n`);
          }
        } catch (error) {
          err(`${repository.key}: poll failed: ${message(error)}\n`);
        }
      }
      await delay(TICK_MS, controller.signal);
    }
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
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
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${message(error)}\n`);
      process.exitCode = 1;
    });
}
