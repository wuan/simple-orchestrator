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
    expect(config.repositories).toHaveLength(2);

    const [repo, override] = config.repositories;
    expect(repo?.provider).toBe('github');
    expect(repo?.pollIntervalSeconds).toBe(60);
    expect(repo?.labels.trigger).toBe(DEFAULT_LABELS.trigger);
    // The shared defaults supply the second entry; only `baseBranch` differs.
    expect(override?.baseBranch).toBe('develop');
    expect(override?.pollIntervalSeconds).toBe(60);

    expect(config.workspace.root).toBe('~/workspace');
    expect(config.workspace.worktrees).toBe('/tmp');
    expect(config.logging.verbose).toBe(false);

    // A shared environment is inherited; the second entry layers its own image
    // and cache on top.
    expect(repo?.environment?.image).toBe('ghcr.io/acme/agent-base:latest');
    expect(repo?.environment?.gitIdentity).toEqual({
      name: 'OpenSpec Agent',
      email: 'agent@example.com',
    });
    expect(override?.environment?.image).toBe('ghcr.io/acme/agent-java:latest');
    expect(override?.environment?.caches).toEqual([
      { name: 'gradle', path: '/home/agent/.gradle' },
    ]);
    // A device entry carries an operator hint; a bare path stays valid.
    expect(override?.environment?.devices).toEqual([
      {
        path: '/dev/qtpy2',
        description: 'Adafruit QT Py ESP32-S2; e-ink display and sensors wired to it',
      },
      { path: '/dev/jtum120' },
    ]);
    expect(override?.environment?.gitIdentity).toEqual({
      name: 'OpenSpec Agent',
      email: 'agent@example.com',
    });

    const resolved = await resolveCredentials(
      config,
      new EnvCredentialResolver({ GITHUB_TOKEN: 'example-token' }),
    );
    expect(resolved.get('github:acme/widget')).toBe('example-token');
    expect(resolved.get('github:acme/gadget')).toBe('example-token');
  });
});
