import { describe, expect, it } from 'vitest';

import { EnvCredentialResolver } from './config/credentials.js';
import {
  DEFAULT_LABELS,
  DEFAULT_LIMITS,
  type EnvironmentSpec,
  type OrchestratorConfig,
} from './config/types.js';
import type { TurnResult } from './domain/types.js';
import { FakeOpenspecCli } from './orchestrator/testing/fake-openspec.js';
import { FakeSandbox } from './orchestrator/testing/fake-sandbox.js';
import { FakeProvider } from './provider/fake/fake-provider.js';
import { FakeRuntime } from './runtime/fake/fake-runtime.js';
import { createService } from './service.js';

function proposeResult(): TurnResult {
  return {
    skill: 'propose',
    commits: ['c1'],
    summary: 'proposed',
    questions: [],
    needsInput: false,
    agentClaimsReady: false,
  };
}

function config(environment?: EnvironmentSpec): OrchestratorConfig {
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
        ...(environment === undefined ? {} : { environment }),
      },
    ],
    limits: DEFAULT_LIMITS,
    workspace: { root: '/tmp/orchestrator-service-test' },
    logging: { verbose: false },
    agent: { model: 'fake/model' },
  };
}

async function driveOnce(
  environment: EnvironmentSpec | undefined,
): Promise<{ runtime: FakeRuntime }> {
  const runtime = new FakeRuntime();
  runtime.enqueue(proposeResult());
  const provider = new FakeProvider();
  provider.seedIssue({ number: 1, labels: ['openspec'] });

  const service = await createService(config(environment), {
    credentials: new EnvCredentialResolver({ ANY_VALUE: '1' }),
    providerFactory: () => provider,
    sandboxFactory: () => new FakeSandbox(),
    runtime,
    openspec: new FakeOpenspecCli(),
  });
  await service.repositories[0]?.poller.pollOnce();
  return { runtime };
}

describe('createService container environment', () => {
  it('threads a repository environment to its turns', async () => {
    const environment: EnvironmentSpec = { image: 'ghcr.io/acme/agent-java:latest' };
    const { runtime } = await driveOnce(environment);

    expect(runtime.requests).toHaveLength(1);
    expect(runtime.requests[0]?.environment).toEqual(environment);
  });

  it('leaves turns in-process when a repository configures no environment', async () => {
    const { runtime } = await driveOnce(undefined);

    expect(runtime.requests).toHaveLength(1);
    expect(runtime.requests[0]?.environment).toBeUndefined();
  });
});
