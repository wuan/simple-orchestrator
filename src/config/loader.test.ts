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
});
