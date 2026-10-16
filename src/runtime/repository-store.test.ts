import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { RepoRef } from '../domain/types.js';
import type { CloneInput, FetchInput } from '../provider/types.js';
import { RepositoryStore, type RepositorySource } from './repository-store.js';

const cleanups: string[] = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'store-test-'));
  cleanups.push(root);
  return root;
}

class RecordingSource implements RepositorySource {
  readonly repo: RepoRef = { owner: 'acme', name: 'widget' };
  readonly clones: CloneInput[] = [];
  readonly fetches: FetchInput[] = [];
  cloneBehavior: (input: CloneInput) => Promise<void> = async (input) => {
    await mkdir(input.destination, { recursive: true });
  };

  async clone(input: CloneInput): Promise<void> {
    this.clones.push({ ...input });
    await this.cloneBehavior(input);
  }

  async fetch(input: FetchInput): Promise<void> {
    this.fetches.push({ ...input });
  }
}

describe('RepositoryStore', () => {
  it('lays out one clone per repository under the root', async () => {
    const store = new RepositoryStore({ root: await tempRoot() });
    expect(store.pathFor({ owner: 'acme', name: 'widget' })).toMatch(/acme[/\\]widget$/);
  });

  it('clones the base branch in full on first use', async () => {
    const root = await tempRoot();
    const store = new RepositoryStore({ root });
    const source = new RecordingSource();

    const path = await store.ensure({ baseBranch: 'main', source });

    expect(path).toBe(store.pathFor(source.repo));
    expect(existsSync(path)).toBe(true);
    expect(source.clones).toEqual([{ branch: 'main', destination: path, full: true }]);
    expect(source.fetches).toEqual([]);
  });

  it('refreshes instead of cloning again when the store already exists', async () => {
    const root = await tempRoot();
    const store = new RepositoryStore({ root });
    const source = new RecordingSource();

    const first = await store.ensure({ baseBranch: 'main', source });
    const second = await store.ensure({ baseBranch: 'main', source });

    expect(second).toBe(first);
    expect(source.clones).toHaveLength(1);
    expect(source.fetches).toEqual([{ destination: first }]);
  });

  it('removes a partial clone when cloning fails', async () => {
    const root = await tempRoot();
    const store = new RepositoryStore({ root });
    const source = new RecordingSource();
    source.cloneBehavior = async (input) => {
      await mkdir(input.destination, { recursive: true });
      throw new Error('clone failed');
    };

    await expect(store.ensure({ baseBranch: 'main', source })).rejects.toThrowError('clone failed');
    expect(existsSync(store.pathFor(source.repo))).toBe(false);
  });
});
