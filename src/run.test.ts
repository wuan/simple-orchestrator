import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LABELS,
  DEFAULT_LIMITS,
  type EnvironmentSpec,
  type OrchestratorConfig,
} from './config/types.js';
import type { TurnContext } from './domain/types.js';
import type {
  OpenCodeClient,
  OpenCodeSkillRequest,
  OpenCodeSkillResult,
} from './runtime/opencode/client.js';
import type { ContainerOpenCodeClientOptions } from './runtime/opencode/container-client.js';
import type { OpenCodeHost } from './runtime/opencode/sdk-client.js';
import { createEmbeddedHostFactory } from './runtime/opencode/sdk-host.js';
import type { TurnRequest } from './runtime/types.js';
import { createRuntime, defaultContainer, defaultEmbedded } from './run.js';

const REPO = { owner: 'acme', name: 'widget' };

function config(): OrchestratorConfig {
  return {
    repositories: [
      {
        provider: 'fake',
        owner: 'acme',
        name: 'widget',
        credential: 'env:ANY_VALUE',
        baseBranch: 'main',
        pollIntervalSeconds: 30,
        maxReviseRounds: 3,
        labels: DEFAULT_LABELS,
      },
    ],
    limits: DEFAULT_LIMITS,
    workspace: { root: '/tmp/orchestrator-run-test' },
    logging: { verbose: false },
    agent: { model: 'fake/model' },
  };
}

/** The same configuration with a provider endpoint and API-key variable pinned. */
function configuredConfig(): OrchestratorConfig {
  return {
    ...config(),
    agent: {
      model: 'greenpt/deepseek-v4.1-flash',
      apiEndpoint: 'https://llm.example.com/v1',
      apiKeyEnv: 'LLM_API_KEY',
    },
  };
}

function context(): TurnContext {
  return {
    skill: 'propose',
    repo: REPO,
    issue: { repo: REPO, number: 1 },
    pullRequest: { repo: REPO, number: 10 },
    branch: 'openspec/issue-1',
    baseBranch: 'main',
    transcript: [],
    pendingFeedback: [],
  };
}

function turnRequest(environment?: EnvironmentSpec): TurnRequest {
  return {
    context: context(),
    workspace: '/tmp/turn/worktree',
    limits: DEFAULT_LIMITS,
    ...(environment === undefined ? {} : { environment }),
  };
}

class RecordingClient implements OpenCodeClient {
  readonly calls: OpenCodeSkillRequest[] = [];
  constructor(private readonly tag: string) {}

  async runSkill(request: OpenCodeSkillRequest): Promise<OpenCodeSkillResult> {
    this.calls.push(request);
    return {
      commits: [],
      summary: this.tag,
      questions: [],
      needsInput: false,
      agentClaimsReady: false,
    };
  }
}

describe('createRuntime', () => {
  it('routes a turn with an environment to the container client', async () => {
    const embedded = new RecordingClient('embedded');
    const container = new RecordingClient('container');
    const handle = createRuntime(config(), {
      createEmbedded: () => ({ client: embedded, dispose: async () => {} }),
      createContainer: () => container,
    });

    const result = await handle.runtime.run(turnRequest({ image: 'img:latest' }));

    expect(result.summary).toBe('container');
    expect(embedded.calls).toHaveLength(0);
    expect(container.calls).toHaveLength(1);
    expect(container.calls[0]?.environment).toEqual({ image: 'img:latest' });
  });

  it('keeps a turn without an environment in the embedded client', async () => {
    const embedded = new RecordingClient('embedded');
    const container = new RecordingClient('container');
    const handle = createRuntime(config(), {
      createEmbedded: () => ({ client: embedded, dispose: async () => {} }),
      createContainer: () => container,
    });

    const result = await handle.runtime.run(turnRequest());

    expect(result.summary).toBe('embedded');
    expect(embedded.calls).toHaveLength(1);
    expect(container.calls).toHaveLength(0);
  });

  it('disposes the embedded client', async () => {
    let disposed = false;
    const handle = createRuntime(config(), {
      createEmbedded: () => ({
        client: new RecordingClient('embedded'),
        dispose: async () => {
          disposed = true;
        },
      }),
      createContainer: () => new RecordingClient('container'),
    });

    await handle.dispose();

    expect(disposed).toBe(true);
  });

  it('passes the configured endpoint and variable to the embedded host', () => {
    const seen: unknown[] = [];
    const createHost: typeof createEmbeddedHostFactory = (options) => {
      seen.push(options);
      return async () => ({}) as OpenCodeHost;
    };

    defaultEmbedded(configuredConfig(), createHost);

    expect(seen[0]).toMatchObject({
      provider: 'greenpt',
      apiEndpoint: 'https://llm.example.com/v1',
      apiKeyEnv: 'LLM_API_KEY',
    });
  });

  it('passes the configured endpoint and variable to the container client', () => {
    const seen: ContainerOpenCodeClientOptions[] = [];

    defaultContainer(configuredConfig(), (options) => {
      seen.push(options);
      return new RecordingClient('container');
    });

    expect(seen[0]).toMatchObject({
      model: 'greenpt/deepseek-v4.1-flash',
      apiEndpoint: 'https://llm.example.com/v1',
      apiKeyEnv: 'LLM_API_KEY',
    });
  });
});
