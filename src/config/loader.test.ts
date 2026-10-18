import { describe, expect, it } from 'vitest';

import { ConfigError, parseConfig } from './loader.js';
import {
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

  it('defaults the agent model when omitted', () => {
    expect(parseConfig(MINIMAL).agent).toEqual({ model: DEFAULT_AGENT_MODEL });
  });

  it('accepts agent overrides', () => {
    const config = parseConfig(`
${MINIMAL}
agent:
  model: acme/model#fast
  agent: build
  database: /data/opencode.db
`);
    expect(config.agent).toEqual({
      model: 'acme/model#fast',
      agent: 'build',
      database: '/data/opencode.db',
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
