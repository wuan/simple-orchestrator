import { join } from 'node:path';

import type { EnvironmentCache } from '../../config/types.js';
import type { RepoRef, TurnUsage } from '../../domain/types.js';
import { NodeContainerRunner, type ContainerRunner } from '../../system/commands.js';
import { buildCachePrepareArgs, buildDockerRunArgs, type DockerCacheMount } from '../sandbox.js';
import type { OpenCodeClient, OpenCodeSkillRequest, OpenCodeSkillResult } from './client.js';
import { resolveSdkVersion } from './sdk-version.js';

/** Path the compiled runner is mounted at inside the container by default. */
export const DEFAULT_RUNNER_MOUNT = '/opt/runner/dist';

export interface ContainerOpenCodeClientOptions {
  /** Host directory holding the compiled runner, bind-mounted read-only. */
  runnerDir: string;
  /** Path the runner directory is mounted at inside the container. */
  runnerMount?: string;
  /** Model the image's embedded host runs, as `provider/id` (plus `#variant`). */
  model?: string;
  agent?: string;
  database?: string;
  /** API base URL for the model's provider; the provider default when omitted. */
  apiEndpoint?: string;
  /** Provider API-key variable to pass into the container; no default. */
  apiKeyEnv?: string;
  /** Runs the container; defaults to the Docker CLI. */
  runner?: ContainerRunner;
  /** Container executable; defaults to `docker`. */
  docker?: string;
  /** The SDK version the image must install; defaults to the host's. */
  sdkVersion?: string;
  /** uid:gid the container runs as; defaults to the orchestrator process. */
  user?: string;
  /** Writable home directory inside the container; defaults to `/tmp`. */
  home?: string;
  logger?: (message: string) => void;
}

/**
 * Scope a repository's cache volume names so two repositories that mount a
 * cache under the same configured `name` never share a volume.
 */
export function scopeCacheVolumes(repo: RepoRef, caches: EnvironmentCache[]): DockerCacheMount[] {
  const scope = `${repo.owner}-${repo.name}`.replace(/[^a-zA-Z0-9_.-]/g, '-').toLowerCase();
  return caches.map((cache) => {
    const named = `orchestrator-${scope}-${cache.name}`.replace(/[^a-zA-Z0-9_.-]/g, '-');
    return { volume: named, path: cache.path };
  });
}

interface ParsedEvent {
  ready?: string;
  usage?: Partial<TurnUsage>;
  result?: OpenCodeSkillResult;
  error?: string;
  protocol?: string;
}

/** Parse one newline-delimited event, never throwing on malformed JSON. */
function parseEvent(line: string): ParsedEvent {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { protocol: `the container returned a malformed event: ${line}` };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { protocol: `the container returned a malformed event: ${line}` };
  }
  const record = raw as Record<string, unknown>;
  switch (record['type']) {
    case 'ready':
      return typeof record['sdkVersion'] === 'string'
        ? { ready: record['sdkVersion'] }
        : { protocol: 'the container returned a ready event without an SDK version' };
    case 'usage':
      return { usage: record['usage'] as Partial<TurnUsage> | undefined };
    case 'result':
      return { result: record['result'] as OpenCodeSkillResult | undefined };
    case 'error':
      return {
        error: typeof record['error'] === 'string' ? record['error'] : 'the container turn failed',
      };
    default:
      return {
        protocol: `the container returned an unknown event type '${String(record['type'])}'`,
      };
  }
}

/**
 * Runs a turn in a container of the repository's environment image. It shells
 * `docker run --rm -i` with the identity mounts `buildDockerRunArgs` builds,
 * writes the JSON request to the container's stdin, forwards usage events to
 * `onUsage`, and resolves with the terminal result. Provisioning and protocol
 * failures - and a missing or malformed result - reject rather than advancing
 * the workflow. Aborting the turn's signal stops the container.
 */
export class ContainerOpenCodeClient implements OpenCodeClient {
  private readonly runnerDir: string;
  private readonly runnerMount: string;
  private readonly model: string | undefined;
  private readonly agent: string | undefined;
  private readonly database: string | undefined;
  private readonly apiEndpoint: string | undefined;
  private readonly apiKeyEnv: string | undefined;
  private readonly runner: ContainerRunner;
  private readonly docker: string;
  private readonly sdkVersion: string;
  private readonly user: string | undefined;
  private readonly home: string | undefined;
  private readonly logger: (message: string) => void;

  /** Cache volumes already prepared (chowned for the turn user) this process. */
  private readonly preparedVolumes = new Set<string>();

  constructor(options: ContainerOpenCodeClientOptions) {
    this.runnerDir = options.runnerDir;
    this.runnerMount = options.runnerMount ?? DEFAULT_RUNNER_MOUNT;
    this.model = options.model;
    this.agent = options.agent;
    this.database = options.database;
    this.apiEndpoint = options.apiEndpoint;
    this.apiKeyEnv = options.apiKeyEnv;
    this.runner = options.runner ?? new NodeContainerRunner();
    this.docker = options.docker ?? 'docker';
    this.sdkVersion = options.sdkVersion ?? resolveSdkVersion();
    this.user = options.user;
    this.home = options.home;
    this.logger = options.logger ?? (() => {});
  }

  runSkill(request: OpenCodeSkillRequest): Promise<OpenCodeSkillResult> {
    const environment = request.environment;
    if (environment === undefined) {
      return Promise.reject(new Error('a container turn requires a configured environment'));
    }
    if (request.store === undefined) {
      return Promise.reject(new Error('a container turn requires the repository store path'));
    }
    // The configured provider variable crosses with the container even when the
    // environment does not name it, without repeating it when it already does.
    const envNames = [...(environment.env ?? [])];
    if (this.apiKeyEnv !== undefined && !envNames.includes(this.apiKeyEnv)) {
      envNames.push(this.apiKeyEnv);
    }
    const store = request.store;
    const caches =
      environment.caches === undefined || request.repo === undefined
        ? undefined
        : scopeCacheVolumes(request.repo, environment.caches);
    return this.prepareCaches(environment.image, caches).then(() => {
      const args = buildDockerRunArgs({
        image: environment.image,
        workspace: request.workspace,
        store,
        runner: this.runnerDir,
        runnerMount: this.runnerMount,
        command: ['node', join(this.runnerMount, 'runner.js')],
        ...(environment.network === undefined ? {} : { network: environment.network }),
        ...(this.user === undefined ? {} : { user: this.user }),
        ...(this.home === undefined ? {} : { home: this.home }),
        ...(envNames.length === 0 ? {} : { env: envNames }),
        ...(environment.gitIdentity === undefined ? {} : { gitIdentity: environment.gitIdentity }),
        ...(caches === undefined ? {} : { caches }),
      });
      const payload = JSON.stringify({
        skill: request.skill,
        prompt: request.prompt,
        workspace: request.workspace,
        ...(this.model === undefined ? {} : { model: this.model }),
        ...(this.agent === undefined ? {} : { agent: this.agent }),
        ...(this.database === undefined ? {} : { database: this.database }),
        ...(this.apiEndpoint === undefined ? {} : { apiEndpoint: this.apiEndpoint }),
        ...(this.apiKeyEnv === undefined ? {} : { apiKeyEnv: this.apiKeyEnv }),
        expectedSdkVersion: this.sdkVersion,
      });
      return this.runTurn(request, args, payload);
    });
  }

  /**
   * Make each cache volume writable by the turn's user, once per process. A
   * named volume is created root-owned and the turn runs as the orchestrator's
   * user, so an image that does not pre-create the cache path cannot seed it
   * with the turn user's ownership and the cache never warms. Best-effort: a
   * volume that cannot be prepared is logged and the turn runs without a warm
   * cache, rather than failing the turn over a caching optimisation.
   */
  private async prepareCaches(
    image: string,
    caches: DockerCacheMount[] | undefined,
  ): Promise<void> {
    await Promise.all((caches ?? []).map((cache) => this.prepareCache(image, cache)));
  }

  private async prepareCache(image: string, cache: DockerCacheMount): Promise<void> {
    if (this.preparedVolumes.has(cache.volume)) return;
    const args = buildCachePrepareArgs({
      image,
      volume: cache.volume,
      path: cache.path,
      ...(this.user === undefined ? {} : { user: this.user }),
    });
    try {
      const result = await this.runner.run({ command: this.docker, args, input: '' });
      if (result.code !== 0) {
        const stderr = result.stderr.trim();
        const suffix = stderr === '' ? '' : `: ${stderr}`;
        this.logger(
          `could not prepare cache volume ${cache.volume} (exit ${result.code ?? 'unknown'})${suffix}`,
        );
        return;
      }
      this.preparedVolumes.add(cache.volume);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger(`could not prepare cache volume ${cache.volume}: ${detail}`);
    }
  }

  /** Run the turn, forwarding usage events and resolving with the terminal result. */
  private runTurn(
    request: OpenCodeSkillRequest,
    args: string[],
    payload: string,
  ): Promise<OpenCodeSkillResult> {
    return new Promise<OpenCodeSkillResult>((resolve, reject) => {
      let buffer = '';
      let result: OpenCodeSkillResult | undefined;
      let failure: string | undefined;
      let protocolError: string | undefined;
      let imageSdkVersion: string | undefined;

      const handleLine = (line: string): void => {
        if (line.trim() === '') return;
        const event = parseEvent(line);
        if (event.ready !== undefined) imageSdkVersion = event.ready;
        if (event.usage !== undefined) request.onUsage?.(event.usage);
        if (event.result !== undefined) result = event.result;
        if (event.error !== undefined) failure = event.error;
        if (event.protocol !== undefined) protocolError = event.protocol;
      };

      const onStdout = (chunk: string): void => {
        buffer += chunk;
        let newline = buffer.indexOf('\n');
        while (newline >= 0) {
          handleLine(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf('\n');
        }
      };

      this.runner
        .run({
          command: this.docker,
          args,
          input: payload,
          ...(request.signal === undefined ? {} : { signal: request.signal }),
          onStdout,
        })
        .then(
          (outcome) => {
            if (buffer.trim() !== '') handleLine(buffer);
            if (request.signal?.aborted === true) {
              reject(new Error('the container turn was aborted'));
              return;
            }
            if (imageSdkVersion !== undefined && imageSdkVersion !== this.sdkVersion) {
              reject(
                new Error(
                  `the image's @opencode/sdk version ${imageSdkVersion} does not match the orchestrator's ${this.sdkVersion}; rebuild the environment image`,
                ),
              );
              return;
            }
            if (failure !== undefined) {
              reject(new Error(failure));
              return;
            }
            if (protocolError !== undefined) {
              reject(new Error(protocolError));
              return;
            }
            if (outcome.code !== 0) {
              const detail = outcome.stderr.trim() === '' ? '' : `: ${outcome.stderr.trim()}`;
              reject(
                new Error(
                  `the environment container exited with code ${outcome.code ?? 'unknown'}${detail}`,
                ),
              );
              return;
            }
            if (result === undefined) {
              reject(new Error('the environment container returned no turn result'));
              return;
            }
            resolve(result);
          },
          (error: unknown) => {
            const detail = error instanceof Error ? error.message : String(error);
            reject(new Error(`could not start the environment container: ${detail}`));
          },
        );
    });
  }
}

/**
 * Routes a turn to the container client when its repository configures an
 * environment and to the embedded in-process client otherwise. The runtime
 * stays a single shared instance; the environment travels on the request.
 */
export class EnvironmentOpenCodeClient implements OpenCodeClient {
  constructor(
    private readonly embedded: OpenCodeClient,
    private readonly container: OpenCodeClient,
  ) {}

  runSkill(request: OpenCodeSkillRequest): Promise<OpenCodeSkillResult> {
    return request.environment === undefined
      ? this.embedded.runSkill(request)
      : this.container.runSkill(request);
  }
}
