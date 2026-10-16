import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { resolveCredentials, EnvCredentialResolver } from './credentials.js';
import { loadConfigFile } from './loader.js';
import { DEFAULT_LABELS } from './types.js';

// The documented example must actually load and resolve.
const EXAMPLE = fileURLToPath(new URL('../../examples/config.yaml', import.meta.url));

describe('documented example config', () => {
  it('parses and resolves credentials', async () => {
    const config = loadConfigFile(EXAMPLE);
    expect(config.repositories).toHaveLength(1);

    const [repo] = config.repositories;
    expect(repo?.provider).toBe('github');
    expect(repo?.pollIntervalSeconds).toBe(60);
    expect(repo?.labels.trigger).toBe(DEFAULT_LABELS.trigger);

    expect(config.workspace.root).toBe('~/workspace');
    expect(config.workspace.worktrees).toBe('/tmp');

    const resolved = await resolveCredentials(
      config,
      new EnvCredentialResolver({ GITHUB_TOKEN: 'example-token' }),
    );
    expect(resolved.get('github:acme/widget')).toBe('example-token');
  });
});
