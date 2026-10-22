import { describe, expect, it } from 'vitest';

import { ConfigError, parseConfig } from './loader.js';
import {
  DEFAULT_AGENT_API_KEY_ENV,
  DEFAULT_AGENT_MODEL,
  DEFAULT_LABELS,
  DEFAULT_MAX_REVISE_ROUNDS,
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEFAULT_WORKSPACE_ROOT,
} from './types.js';

const MINIMAL = `
repositories:
  - provider: github
    owner: acme
    name: widget
    credential: env:GITHUB_TOKEN
`;

describe('parseConfig', () => {
  it('applies documented defaults when overrides are omitted', () => {
    const config = parseConfig(MINIMAL);
    const [repo] = config.repositories;
    expect(repo).toBeDefined();
    expect(repo?.labels).toEqual(DEFAULT_LABELS);
    expect(repo?.pollIntervalSeconds).toBe(DEFAULT_POLL_INTERVAL_SECONDS);
    expect(repo?.maxReviseRounds).toBe(DEFAULT_MAX_REVISE_ROUNDS);
    expect(repo?.baseBranch).toBe('main');
    expect(config.limits.maxSteps).toBeGreaterThan(0);
  });

  it('accepts label and interval overrides', () => {
    const config = parseConfig(`
repositories:
  - provider: github
    owner: acme
    name: widget
    credential: env:GITHUB_TOKEN
    baseBranch: trunk
    pollIntervalSeconds: 120
    maxReviseRounds: 5
    labels:
      trigger: flow-start
      ready: flow-ready
`);
    const [repo] = config.repositories;
    expect(repo?.baseBranch).toBe('trunk');
    expect(repo?.pollIntervalSeconds).toBe(120);
    expect(repo?.maxReviseRounds).toBe(5);
    expect(repo?.labels.trigger).toBe('flow-start');
    expect(repo?.labels.ready).toBe('flow-ready');
    expect(repo?.labels.proposing).toBe(DEFAULT_LABELS.proposing);
  });

  it('fails fast, naming the repository, when a credential reference is missing', () => {
    const bad = `
repositories:
  - provider: github
    owner: acme
    name: widget
`;
    expect(() => parseConfig(bad)).toThrowError(ConfigError);
    try {
      parseConfig(bad);
    } catch (error) {
      expect((error as ConfigError).repo).toBe('acme/widget');
      expect((error as Error).message).toContain('acme/widget');
      expect((error as Error).message).toContain('credential');
    }
  });

  it('rejects an empty repository list', () => {
    expect(() => parseConfig('repositories: []')).toThrowError(/non-empty list/);
  });

  it('rejects a non-integer poll interval', () => {
    const bad = `
repositories:
  - provider: github
    owner: acme
    name: widget
    credential: env:GITHUB_TOKEN
    pollIntervalSeconds: 0
`;
    expect(() => parseConfig(bad)).toThrowError(/positive integer/);
  });

  it('defaults the workspace locations when omitted', () => {
    const config = parseConfig(MINIMAL);
    expect(config.workspace.root).toBe(DEFAULT_WORKSPACE_ROOT);
    expect(config.workspace.worktrees).toBeUndefined();
  });

  it('accepts workspace overrides', () => {
    const config = parseConfig(`
${MINIMAL}
workspace:
  root: /srv/clones
  worktrees: /scratch
`);
    expect(config.workspace.root).toBe('/srv/clones');
    expect(config.workspace.worktrees).toBe('/scratch');
  });

  it('rejects an empty worktrees directory', () => {
    const bad = `
${MINIMAL}
workspace:
  worktrees: ''
`;
    expect(() => parseConfig(bad)).toThrowError(/worktrees/);
  });

  it('defaults verbose logging to off when the block is omitted', () => {
    expect(parseConfig(MINIMAL).logging.verbose).toBe(false);
  });

  it('accepts logging.verbose when provided', () => {
    expect(parseConfig(`${MINIMAL}\nlogging:\n  verbose: true\n`).logging.verbose).toBe(true);
  });

  it('rejects a non-boolean verbose value', () => {
    const bad = `
${MINIMAL}
logging:
  verbose: 3
`;
    expect(() => parseConfig(bad)).toThrowError(/verbose/);
  });

  it('defaults the agent model and generic API-key variable when omitted', () => {
    expect(parseConfig(MINIMAL).agent).toEqual({
      model: DEFAULT_AGENT_MODEL,
      apiKeyEnv: DEFAULT_AGENT_API_KEY_ENV,
    });
  });

  it('accepts agent overrides, including the endpoint and API-key variable', () => {
    const config = parseConfig(`
${MINIMAL}
agent:
  model: acme/model#fast
  agent: build
  database: /data/opencode.db
  apiEndpoint: https://llm.example.com/v1
  apiKeyEnv: ACME_API_KEY
`);
    expect(config.agent).toEqual({
      model: 'acme/model#fast',
      agent: 'build',
      database: '/data/opencode.db',
      apiEndpoint: 'https://llm.example.com/v1',
      apiKeyEnv: 'ACME_API_KEY',
    });
  });

  it('defaults the API-key variable while keeping an explicit endpoint', () => {
    const config = parseConfig(`
${MINIMAL}
agent:
  apiEndpoint: https://llm.example.com/v1
`);
    expect(config.agent).toEqual({
      model: DEFAULT_AGENT_MODEL,
      apiEndpoint: 'https://llm.example.com/v1',
      apiKeyEnv: DEFAULT_AGENT_API_KEY_ENV,
    });
  });

  it('rejects an empty agent model', () => {
    const bad = `
${MINIMAL}
agent:
  model: ''
`;
    expect(() => parseConfig(bad)).toThrowError(/model/);
  });

  it('rejects an empty or non-string agent endpoint', () => {
    expect(() =>
      parseConfig(`
${MINIMAL}
agent:
  apiEndpoint: ''
`),
    ).toThrowError(/apiEndpoint/);
    expect(() =>
      parseConfig(`
${MINIMAL}
agent:
  apiEndpoint: 42
`),
    ).toThrowError(/apiEndpoint/);
  });

  it('rejects an empty or non-string agent API-key variable', () => {
    expect(() =>
      parseConfig(`
${MINIMAL}
agent:
  apiKeyEnv: ''
`),
    ).toThrowError(/apiKeyEnv/);
    expect(() =>
      parseConfig(`
${MINIMAL}
agent:
  apiKeyEnv: false
`),
    ).toThrowError(/apiKeyEnv/);
  });

  describe('turn environments', () => {
    it('leaves the environment unset when not configured', () => {
      expect(parseConfig(MINIMAL).repositories[0]?.environment).toBeUndefined();
    });

    it('parses a complete environment block', () => {
      const config = parseConfig(`
repositories:
  - provider: github
    owner: acme
    name: android-app
    credential: env:GITHUB_TOKEN
    environment:
      image: ghcr.io/acme/agent-android:latest
      network: bridge
      env:
        - LLM_API_KEY
      gitIdentity:
        name: Orchestrator Agent
        email: agent@example.com
      caches:
        - name: gradle
          path: /home/agent/.gradle
`);
      expect(config.repositories[0]?.environment).toEqual({
        image: 'ghcr.io/acme/agent-android:latest',
        network: 'bridge',
        env: ['LLM_API_KEY'],
        gitIdentity: { name: 'Orchestrator Agent', email: 'agent@example.com' },
        caches: [{ name: 'gradle', path: '/home/agent/.gradle' }],
      });
    });

    it('parses an explicit image pull policy', () => {
      const config = parseConfig(`
${MINIMAL}    environment:
      image: node:24
      pull: never
`);
      expect(config.repositories[0]?.environment?.pull).toBe('never');
    });

    it('merges a shared image pull policy beneath an entry', () => {
      const config = parseConfig(`
defaults:
  provider: github
  owner: acme
  credential: env:GITHUB_TOKEN
  environment:
    image: ghcr.io/acme/base:latest
    pull: missing
repositories:
  - name: widget
  - name: gadget
    environment:
      pull: never
`);
      const [widget, gadget] = config.repositories;
      expect(widget?.environment?.pull).toBe('missing');
      expect(gadget?.environment?.pull).toBe('never');
    });

    it('fails fast, naming the repository, when the pull policy is unsupported', () => {
      const bad = `
${MINIMAL}    environment:
      image: node:24
      pull: sometimes
`;
      expect(() => parseConfig(bad)).toThrowError(ConfigError);
      try {
        parseConfig(bad);
      } catch (error) {
        expect((error as ConfigError).repo).toBe('acme/widget');
        expect((error as Error).message).toContain('pull');
      }
    });

    it('fails fast, naming the repository, when the image is missing', () => {
      const bad = `
repositories:
  - provider: github
    owner: acme
    name: widget
    credential: env:GITHUB_TOKEN
    environment:
      network: bridge
`;
      expect(() => parseConfig(bad)).toThrowError(ConfigError);
      try {
        parseConfig(bad);
      } catch (error) {
        expect((error as ConfigError).repo).toBe('acme/widget');
        expect((error as Error).message).toContain('environment.image');
      }
    });

    it('rejects an empty image value', () => {
      const bad = `
${MINIMAL}    environment:
      image: ''
`;
      expect(() => parseConfig(bad)).toThrowError(/image/);
    });

    it('rejects an env entry that is not a list', () => {
      const bad = `
${MINIMAL}    environment:
      image: node:24
      env: LLM_API_KEY
`;
      expect(() => parseConfig(bad)).toThrowError(/env.*list/);
    });

    it('rejects an empty environment variable name', () => {
      const bad = `
${MINIMAL}    environment:
      image: node:24
      env:
        - ''
`;
      expect(() => parseConfig(bad)).toThrowError(/env\[0\]/);
    });

    it('rejects an incomplete git identity', () => {
      const bad = `
${MINIMAL}    environment:
      image: node:24
      gitIdentity:
        name: Agent
`;
      expect(() => parseConfig(bad)).toThrowError(/gitIdentity.*email/);
    });

    it('rejects a cache without a mount path', () => {
      const bad = `
${MINIMAL}    environment:
      image: node:24
      caches:
        - name: gradle
`;
      expect(() => parseConfig(bad)).toThrowError(/caches\[0\].*path/);
    });

    it('rejects a non-mapping environment block', () => {
      const bad = `
${MINIMAL}    environment: node:24
`;
      expect(() => parseConfig(bad)).toThrowError(/environment must be a mapping/);
    });
  });

  describe('shared defaults', () => {
    const SHARED = `
defaults:
  provider: github
  owner: acme
  credential: env:GITHUB_TOKEN
  baseBranch: develop
  pollIntervalSeconds: 90
  maxReviseRounds: 5
  labels:
    trigger: flow-start
repositories:
  - name: widget
`;

    it('inherits every shared default into a repository entry', () => {
      const config = parseConfig(SHARED);
      const [repo] = config.repositories;
      expect(repo?.provider).toBe('github');
      expect(repo?.owner).toBe('acme');
      expect(repo?.credential).toBe('env:GITHUB_TOKEN');
      expect(repo?.baseBranch).toBe('develop');
      expect(repo?.pollIntervalSeconds).toBe(90);
      expect(repo?.maxReviseRounds).toBe(5);
      expect(repo?.labels.trigger).toBe('flow-start');
      expect(repo?.labels.ready).toBe(DEFAULT_LABELS.ready);
    });

    it('lets an entry override a default from another source', () => {
      const config = parseConfig(`
defaults:
  provider: github
  owner: acme
  credential: env:GITHUB_TOKEN
  baseBranch: develop
  labels:
    trigger: flow-start
    ready: flow-ready
repositories:
  - name: widget
    baseBranch: main
    labels:
      ready: widget-ready
  - name: gadget
`);
      const [widget, gadget] = config.repositories;
      expect(widget?.baseBranch).toBe('main');
      expect(widget?.labels.ready).toBe('widget-ready');
      expect(widget?.labels.trigger).toBe('flow-start');
      expect(widget?.labels.proposing).toBe(DEFAULT_LABELS.proposing);
      expect(gadget?.baseBranch).toBe('develop');
      expect(gadget?.labels.ready).toBe('flow-ready');
    });

    it('falls back to the built-in defaults when neither layer sets a field', () => {
      const config = parseConfig(`
defaults:
  provider: github
  owner: acme
  credential: env:GITHUB_TOKEN
repositories:
  - name: widget
`);
      const [repo] = config.repositories;
      expect(repo?.baseBranch).toBe('main');
      expect(repo?.pollIntervalSeconds).toBe(DEFAULT_POLL_INTERVAL_SECONDS);
      expect(repo?.maxReviseRounds).toBe(DEFAULT_MAX_REVISE_ROUNDS);
      expect(repo?.labels).toEqual(DEFAULT_LABELS);
    });

    it('inherits a shared environment and lets an entry override its image', () => {
      const config = parseConfig(`
defaults:
  provider: github
  owner: acme
  credential: env:GITHUB_TOKEN
  environment:
    image: ghcr.io/acme/base:latest
    gitIdentity:
      name: Agent
      email: agent@example.com
repositories:
  - name: android-app
    environment:
      image: ghcr.io/acme/android:latest
  - name: gadget
`);
      const [android, gadget] = config.repositories;
      expect(android?.environment?.image).toBe('ghcr.io/acme/android:latest');
      expect(android?.environment?.gitIdentity).toEqual({
        name: 'Agent',
        email: 'agent@example.com',
      });
      expect(gadget?.environment?.image).toBe('ghcr.io/acme/base:latest');
    });

    it('reports an invalid default environment at the defaults context', () => {
      const bad = `
defaults:
  provider: github
  owner: acme
  credential: env:GITHUB_TOKEN
  environment:
    image: node:24
    env: 'not-a-list'
${MINIMAL}`;
      expect(() => parseConfig(bad)).toThrowError(/defaults\.environment: 'env' must be a list/);
    });

    it('resolves a reduced entry exactly like the fully-specified form', () => {
      const reduced = parseConfig(`
defaults:
  provider: github
  owner: acme
  credential: env:GITHUB_TOKEN
repositories:
  - name: widget
`);
      expect(reduced.repositories[0]).toEqual(parseConfig(MINIMAL).repositories[0]);
    });

    it('rejects a non-mapping defaults block', () => {
      const bad = `
defaults: 3
${MINIMAL}
`;
      expect(() => parseConfig(bad)).toThrowError(/defaults must be a mapping/);
    });

    it('rejects an invalid scalar in defaults at the defaults context', () => {
      const bad = `
defaults:
  pollIntervalSeconds: 0
${MINIMAL}
`;
      expect(() => parseConfig(bad)).toThrowError(
        /defaults: 'pollIntervalSeconds' must be a positive integer/,
      );
    });

    it('rejects an invalid label in defaults at the defaults context', () => {
      const bad = `
defaults:
  labels:
    trigger: ''
${MINIMAL}
`;
      expect(() => parseConfig(bad)).toThrowError(
        /defaults\.labels: 'trigger' must be a non-empty string/,
      );
    });

    it('rejects name inside defaults', () => {
      const bad = `
defaults:
  name: widget
${MINIMAL}
`;
      expect(() => parseConfig(bad)).toThrowError(/defaults: 'name'/);
    });

    it('still requires name on every entry when defaults is present', () => {
      const bad = `
defaults:
  provider: github
  owner: acme
  credential: env:GITHUB_TOKEN
repositories:
  - owner: acme
`;
      expect(() => parseConfig(bad)).toThrowError(
        /repositories\[0\]: 'name' is required and must be a non-empty string/,
      );
    });

    it('fails naming the repository when a required field is absent from both layers', () => {
      const bad = `
defaults:
  provider: github
  owner: acme
repositories:
  - name: widget
`;
      expect(() => parseConfig(bad)).toThrowError(ConfigError);
      try {
        parseConfig(bad);
      } catch (error) {
        expect((error as ConfigError).repo).toBe('acme/widget');
        expect((error as Error).message).toContain('credential');
      }
    });
  });
});
