import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { NodeCommandRunner, type CommandRunner } from '../system/commands.js';
import { RepositoryStore, type RepositorySource } from './repository-store.js';
import { buildDockerRunArgs, WorktreeSandbox } from './sandbox.js';

const cleanups: string[] = [];
const commands: CommandRunner = new NodeCommandRunner();

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function git(args: string[]): Promise<void> {
  const result = await commands.run('git', args);
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
}

interface Fixture {
  base: string;
  remote: string;
  seed: string;
  store: RepositoryStore;
  source: RepositorySource;
  worktrees: string;
}

/** A local bare "remote" with `main` and an `openspec/issue-1` branch. */
async function fixture(): Promise<Fixture> {
  const base = await mkdtemp(join(tmpdir(), 'sandbox-git-'));
  cleanups.push(base);
  const remote = join(base, 'origin.git');
  const seed = join(base, 'seed');
  const worktrees = join(base, 'worktrees');

  await git(['init', '--bare', remote]);
  await git(['init', seed]);
  await git(['-C', seed, 'config', 'user.email', 'test@example.com']);
  await git(['-C', seed, 'config', 'user.name', 'Test']);
  await writeFile(join(seed, 'README.md'), 'hi\n');
  await git(['-C', seed, 'add', '.']);
  await git(['-C', seed, 'commit', '-m', 'init']);
  await git(['-C', seed, 'branch', '-M', 'main']);
  await git(['-C', seed, 'remote', 'add', 'origin', remote]);
  await git(['-C', seed, 'push', 'origin', 'main']);
  await git(['-C', seed, 'checkout', '-b', 'openspec/issue-1']);
  await writeFile(join(seed, 'change.md'), 'change\n');
  await git(['-C', seed, 'add', '.']);
  await git(['-C', seed, 'commit', '-m', 'change']);
  await git(['-C', seed, 'push', 'origin', 'openspec/issue-1']);

  await mkdir(worktrees, { recursive: true });

  const source: RepositorySource = {
    repo: { owner: 'acme', name: 'widget' },
    async clone({ branch, destination }) {
      await git(['clone', '--branch', branch, remote, destination]);
    },
    async fetch({ destination }) {
      await git(['-C', destination, 'fetch', '--prune', 'origin']);
    },
  };

  return {
    base,
    remote,
    seed,
    store: new RepositoryStore({ root: join(base, 'clones') }),
    source,
    worktrees,
  };
}

function sandboxFor(f: Fixture, source: RepositorySource = f.source): WorktreeSandbox {
  return new WorktreeSandbox({
    store: f.store,
    source,
    baseBranch: 'main',
    root: f.worktrees,
    commands,
  });
}

describe('WorktreeSandbox', () => {
  it('checks the workflow branch out in a worktree of the store', async () => {
    const f = await fixture();
    const sandbox = sandboxFor(f);

    const handle = await sandbox.create({ branch: 'openspec/issue-1' });

    expect(existsSync(join(handle.workspace, 'change.md'))).toBe(true);
    const head = await commands.run('git', ['-C', handle.workspace, 'rev-parse', '--abbrev-ref', 'HEAD']);
    expect(head.stdout.trim()).toBe('openspec/issue-1');
    // The store itself is cloned once and survives the turn.
    expect(existsSync(f.store.pathFor(f.source.repo))).toBe(true);
  });

  it('discards the worktree but keeps the store when the turn ends', async () => {
    const f = await fixture();
    const sandbox = sandboxFor(f);
    const handle = await sandbox.create({ branch: 'openspec/issue-1' });
    expect(existsSync(handle.workspace)).toBe(true);

    await handle.dispose();

    expect(existsSync(handle.workspace)).toBe(false);
    expect(existsSync(f.store.pathFor(f.source.repo))).toBe(true);
    await handle.dispose(); // idempotent
  });

  it('gives successive turns distinct workspaces and refreshes the branch', async () => {
    const f = await fixture();
    const sandbox = sandboxFor(f);

    const first = await sandbox.create({ branch: 'openspec/issue-1' });
    const firstWorkspace = first.workspace;
    await first.dispose();

    // Advance the workflow branch as a previous turn would.
    await writeFile(join(f.seed, 'later.md'), 'later\n');
    await git(['-C', f.seed, 'add', '.']);
    await git(['-C', f.seed, 'commit', '-m', 'later']);
    await git(['-C', f.seed, 'push', 'origin', 'openspec/issue-1']);

    const second = await sandbox.create({ branch: 'openspec/issue-1' });

    expect(second.workspace).not.toBe(firstWorkspace);
    expect(existsSync(join(second.workspace, 'later.md'))).toBe(true);
    await second.dispose();
  });

  it('cleans up when cloning fails', async () => {
    const f = await fixture();
    const failing: RepositorySource = {
      repo: f.source.repo,
      async clone() {
        throw new Error('clone failed');
      },
      async fetch() {},
    };

    await expect(sandboxFor(f, failing).create({ branch: 'openspec/issue-1' })).rejects.toThrowError(
      'clone failed',
    );
    expect(await readdir(f.worktrees)).toEqual([]);
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
