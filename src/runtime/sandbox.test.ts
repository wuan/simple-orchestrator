import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FakeProvider } from '../provider/fake/fake-provider.js';
import { buildDockerRunArgs, EphemeralWorkspaceSandbox } from './sandbox.js';

const cleanups: string[] = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sandbox-test-'));
  cleanups.push(root);
  return root;
}

describe('EphemeralWorkspaceSandbox', () => {
  it('gives each turn its own workspace cloned at the branch', async () => {
    const provider = new FakeProvider();
    const sandbox = new EphemeralWorkspaceSandbox({ provider, root: await tempRoot() });

    const first = await sandbox.create({ branch: 'openspec/issue-1' });
    const second = await sandbox.create({ branch: 'openspec/issue-1' });

    expect(first.workspace).not.toBe(second.workspace);
    expect(existsSync(first.workspace)).toBe(true);
    expect(existsSync(second.workspace)).toBe(true);
    expect(provider.clones).toEqual([
      { branch: 'openspec/issue-1', destination: first.workspace },
      { branch: 'openspec/issue-1', destination: second.workspace },
    ]);
  });

  it('discards the workspace when the turn ends', async () => {
    const sandbox = new EphemeralWorkspaceSandbox({ provider: new FakeProvider(), root: await tempRoot() });
    const handle = await sandbox.create({ branch: 'b' });
    expect(existsSync(handle.workspace)).toBe(true);
    await handle.dispose();
    expect(existsSync(handle.workspace)).toBe(false);
    await handle.dispose(); // idempotent
  });

  it('cleans up when cloning fails', async () => {
    const failing = new FakeProvider();
    failing.clone = async () => {
      throw new Error('clone failed');
    };
    const root = await tempRoot();
    const sandbox = new EphemeralWorkspaceSandbox({ provider: failing, root });
    await expect(sandbox.create({ branch: 'b' })).rejects.toThrowError('clone failed');
    const { readdir } = await import('node:fs/promises');
    expect(await readdir(root)).toEqual([]);
  });
});

describe('buildDockerRunArgs', () => {
  it('isolates the container and mounts the workspace', () => {
    const args = buildDockerRunArgs({ image: 'opencode:latest', workspace: '/tmp/work', command: ['propose'] });
    expect(args.slice(0, 5)).toEqual(['run', '--rm', '--network', 'none', '--workdir']);
    expect(args).toContain('/tmp/work:/workspace');
    expect(args.slice(-2)).toEqual(['opencode:latest', 'propose']);
  });
});
