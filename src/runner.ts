import process from 'node:process';
import { pathToFileURL } from 'node:url';

import type { TurnSkill, TurnUsage } from './domain/types.js';
import type { OpenCodeSkillRequest, OpenCodeSkillResult } from './runtime/opencode/client.js';
import { EmbeddedOpenCodeClient } from './runtime/opencode/sdk-client.js';
import { createEmbeddedHostFactory, parseModelRef } from './runtime/opencode/sdk-host.js';
import { resolveSdkVersion } from './runtime/opencode/sdk-version.js';

/** The JSON request the host writes to a turn container's stdin. */
export interface RunnerRequest {
  skill: TurnSkill;
  prompt: string;
  workspace: string;
  /** OpenCode model as `provider/id` (plus `#variant`). */
  model?: string;
  agent?: string;
  database?: string;
  /** The orchestrator's `@opencode/sdk` version the image must match. */
  expectedSdkVersion?: string;
}

/** A newline-delimited event the runner writes to the host on stdout. */
export type RunnerEvent =
  | { type: 'ready'; sdkVersion: string }
  | { type: 'usage'; usage: Partial<TurnUsage> }
  | { type: 'result'; result: OpenCodeSkillResult }
  | { type: 'error'; error: string };

/** The options a runner passes to its in-container OpenCode client. */
export interface RunnerClientOptions {
  model?: string;
  agent?: string;
  database?: string;
}

/** The client the runner drives, narrowed to what the entry point needs. */
export interface RunnerClient {
  runSkill(request: OpenCodeSkillRequest): Promise<OpenCodeSkillResult>;
  dispose(): Promise<void>;
}

export type RunnerClientFactory = (options: RunnerClientOptions) => RunnerClient;

export interface RunnerDeps {
  /** Writes one event line to the host. */
  write: (event: RunnerEvent) => void;
  /** Builds the embedded OpenCode client the runner drives. */
  createClient: RunnerClientFactory;
  /** Resolves the image's installed `@opencode/sdk` version. */
  sdkVersion: () => string;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Validate the host's JSON request, rejecting anything malformed. */
export function parseRunnerRequest(input: string): RunnerRequest {
  const raw: unknown = JSON.parse(input);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('the runner request must be a JSON object');
  }
  const record = raw as Record<string, unknown>;
  const skill = record['skill'];
  if (skill !== 'propose' && skill !== 'apply') {
    throw new Error("the runner request 'skill' must be 'propose' or 'apply'");
  }
  const prompt = record['prompt'];
  if (typeof prompt !== 'string' || prompt === '') {
    throw new Error("the runner request 'prompt' must be a non-empty string");
  }
  const workspace = record['workspace'];
  if (typeof workspace !== 'string' || workspace === '') {
    throw new Error("the runner request 'workspace' must be a non-empty string");
  }
  const optional = (key: string): string | undefined => {
    const value = record[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value === '') {
      throw new Error(`the runner request '${key}' must be a non-empty string when provided`);
    }
    return value;
  };
  const model = optional('model');
  const agent = optional('agent');
  const database = optional('database');
  const expectedSdkVersion = optional('expectedSdkVersion');
  return {
    skill,
    prompt,
    workspace,
    ...(model === undefined ? {} : { model }),
    ...(agent === undefined ? {} : { agent }),
    ...(database === undefined ? {} : { database }),
    ...(expectedSdkVersion === undefined ? {} : { expectedSdkVersion }),
  };
}

/**
 * Run one turn inside the container: read the host's request, drive the
 * embedded OpenCode client, and stream newline-delimited JSON events back.
 * Usage is forwarded as it is reported - before a later failure - and every
 * error is mapped to a terminal `error` event. Returns the process exit code.
 */
export async function runRunner(input: string, deps: RunnerDeps): Promise<number> {
  let request: RunnerRequest;
  try {
    request = parseRunnerRequest(input);
  } catch (error) {
    deps.write({ type: 'error', error: `invalid runner request: ${message(error)}` });
    return 1;
  }

  let sdkVersion: string;
  try {
    sdkVersion = deps.sdkVersion();
  } catch (error) {
    deps.write({ type: 'error', error: `could not resolve @opencode/sdk: ${message(error)}` });
    return 1;
  }
  if (request.expectedSdkVersion !== undefined && request.expectedSdkVersion !== sdkVersion) {
    deps.write({
      type: 'error',
      error: `the image's @opencode/sdk version ${sdkVersion} does not match the orchestrator's ${request.expectedSdkVersion}; rebuild the environment image`,
    });
    return 1;
  }
  deps.write({ type: 'ready', sdkVersion });

  const client = deps.createClient({
    ...(request.model === undefined ? {} : { model: request.model }),
    ...(request.agent === undefined ? {} : { agent: request.agent }),
    ...(request.database === undefined ? {} : { database: request.database }),
  });
  try {
    const result = await client.runSkill({
      skill: request.skill,
      workspace: request.workspace,
      prompt: request.prompt,
      onUsage: (usage) => deps.write({ type: 'usage', usage }),
    });
    deps.write({ type: 'result', result });
    return 0;
  } catch (error) {
    deps.write({ type: 'error', error: message(error) });
    return 1;
  } finally {
    await client.dispose();
  }
}

function defaultCreateClient(options: RunnerClientOptions): RunnerClient {
  const model = options.model === undefined ? undefined : parseModelRef(options.model);
  return new EmbeddedOpenCodeClient(
    createEmbeddedHostFactory(options.database === undefined ? {} : { database: options.database }),
    {
      ...(model === undefined ? {} : { model }),
      ...(options.agent === undefined ? {} : { agent: options.agent }),
    },
  );
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** The container entry point: read stdin, run one turn, stream events, exit. */
export async function main(): Promise<number> {
  const input = await readStdin();
  return runRunner(input, {
    write: (event) => process.stdout.write(`${JSON.stringify(event)}\n`),
    createClient: defaultCreateClient,
    sdkVersion: resolveSdkVersion,
  });
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
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${message(error)}\n`);
      process.exitCode = 1;
    });
}
