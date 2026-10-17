import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_LABELS } from '../config/types.js';
import type { TurnResult } from '../domain/types.js';
import { FakeProvider } from '../provider/fake/fake-provider.js';
import { FakeRuntime } from '../runtime/fake/fake-runtime.js';
import { RepositoryStore, type RepositorySource } from '../runtime/repository-store.js';
import { WorktreeSandbox } from '../runtime/sandbox.js';
import type { AgentRuntime, TurnRequest } from '../runtime/types.js';
import { NodeCommandRunner } from '../system/commands.js';
import { Poller } from './poller.js';
import { FakeOpenspecCli } from './testing/fake-openspec.js';
import { FakeSandbox } from './testing/fake-sandbox.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function proposeResult(summary: string): TurnResult {
  return {
    skill: 'propose',
    commits: ['c1'],
    summary,
    questions: [],
    needsInput: false,
    agentClaimsReady: false,
  };
}

function applyResult(): TurnResult {
  return {
    skill: 'apply',
    commits: ['code-commit', 'archive-commit'],
    summary: 'implemented tasks and archived the change',
    questions: [],
    needsInput: false,
    agentClaimsReady: true,
  };
}

function makePoller(
  provider: FakeProvider,
  runtime: FakeRuntime,
  openspec: FakeOpenspecCli,
  logger?: (message: string) => void,
): Poller {
  return new Poller({
    provider,
    runtime,
    sandbox: new FakeSandbox(),
    openspec,
    labels: DEFAULT_LABELS,
    baseBranch: 'main',
    logger,
  });
}

async function labelsOf(provider: FakeProvider, number: number): Promise<string[]> {
  return (await provider.getPullRequest({ repo: provider.repo, number }))?.labels ?? [];
}

describe('end-to-end workflow', () => {
  it('runs propose -> revise -> approve -> apply -> merge to completion', async () => {
    const provider = new FakeProvider();
    const runtime = new FakeRuntime();
    const openspec = new FakeOpenspecCli();
    openspec.markInProgress('add-x');
    const poller = makePoller(provider, runtime, openspec);
    provider.seedIssue({ number: 1, labels: ['openspec'] });

    // 1. Propose.
    runtime.enqueue(proposeResult('proposed the change'));
    await poller.pollOnce();
    expect(await labelsOf(provider, 100)).toContain(DEFAULT_LABELS.proposing);

    // 2. Request changes; the revise lands the change as ready.
    provider.seedReview(100, { state: 'changes_requested', body: 'tighten the scope' });
    openspec.markReady('add-x');
    runtime.enqueue(proposeResult('revised the change'));
    await poller.pollOnce();
    expect(await labelsOf(provider, 100)).toContain(DEFAULT_LABELS.ready);

    // 3. Approve; the apply turn runs (and archives inside its turn).
    provider.seedReview(100, { state: 'approved', body: 'lgtm' });
    runtime.enqueue(applyResult());
    await poller.pollOnce();
    expect(await labelsOf(provider, 100)).toContain(DEFAULT_LABELS.implementing);

    const applyRequest = runtime.requests.find((request) => request.context.skill === 'apply');
    expect(applyRequest).toBeDefined();
    expect(applyRequest?.context.pendingFeedback.some((event) => event.kind === 'approval')).toBe(
      true,
    );
    expect(provider.commentLog.some((entry) => entry.body.includes('OpenSpec apply turn'))).toBe(
      true,
    );

    // 4. Merge completes the workflow.
    provider.setPullRequestState(100, 'merged');
    await poller.pollOnce();
    expect(await labelsOf(provider, 100)).toContain(DEFAULT_LABELS.done);
  });

  it('resumes after a restart mid-workflow without duplicating turns', async () => {
    const provider = new FakeProvider();
    const runtime = new FakeRuntime();
    const openspec = new FakeOpenspecCli();
    openspec.markInProgress('add-x');
    provider.seedIssue({ number: 1, labels: ['openspec'] });

    runtime.enqueue(proposeResult('proposed'));
    await makePoller(provider, runtime, openspec).pollOnce();
    const turnsAfterPropose = runtime.requests.length;

    // Restart: a fresh poller with no local memory.
    await makePoller(provider, runtime, openspec).pollOnce();
    expect(runtime.requests.length).toBe(turnsAfterPropose);
  });

  it('produces poll-cycle and turn diagnostics when verbose is enabled', async () => {
    const provider = new FakeProvider();
    const runtime = new FakeRuntime();
    const openspec = new FakeOpenspecCli();
    openspec.markInProgress('add-x');
    provider.seedIssue({ number: 1, labels: ['openspec'] });

    const messages: string[] = [];
    const poller = makePoller(provider, runtime, openspec, (message) => messages.push(message));
    runtime.enqueue(proposeResult('proposed the change'));
    await poller.pollOnce();

    const log = messages.join('\n');
    expect(log).toContain('polling fake:acme/widget');
    expect(log).toContain('started workflow for issue #1 (PR #100)');
    expect(log).toContain('starting propose turn');
    expect(log).toContain('readiness');
  });

  it('emits no diagnostics when verbose is disabled', async () => {
    const provider = new FakeProvider();
    const runtime = new FakeRuntime();
    const openspec = new FakeOpenspecCli();
    openspec.markInProgress('add-x');
    provider.seedIssue({ number: 1, labels: ['openspec'] });

    // No logger is injected, exactly as when verbose is off.
    runtime.enqueue(proposeResult('proposed the change'));
    const report = await makePoller(provider, runtime, openspec).pollOnce();

    expect(report.started).toEqual([1]);
    expect(runtime.requests).toHaveLength(1);
  });
});

describe('end-to-end base integration', () => {
  function git(cwd: string | null, args: string[]): void {
    execFileSync('git', args, { ...(cwd === null ? {} : { cwd }), stdio: 'ignore' });
  }

  /** Records whether each turn's workspace already contains the base marker file. */
  class BaseRecordingRuntime implements AgentRuntime {
    readonly id = 'base-recording';
    readonly basePresent: boolean[] = [];
    async run(request: TurnRequest): Promise<TurnResult> {
      this.basePresent.push(existsSync(join(request.workspace, 'base-marker.md')));
      // Model a real turn: commit something so the workflow branch advances.
      writeFileSync(join(request.workspace, `turn-${this.basePresent.length}.md`), 'turn\n');
      git(request.workspace, ['add', '.']);
      git(request.workspace, [
        '-c',
        'user.email=test@example.com',
        '-c',
        'user.name=Test',
        'commit',
        '-m',
        'turn work',
      ]);
      return proposeResult('recorded a turn');
    }
  }

  it('merges the base into a later turn before it runs, and the workflow advances', async () => {
    const base = mkdtempSync(join(tmpdir(), 'orchestrator-e2e-git-'));
    tempDirs.push(base);
    const remote = join(base, 'origin.git');
    const seed = join(base, 'seed');
    const worktrees = join(base, 'worktrees');

    git(null, ['init', '--bare', remote]);
    git(null, ['init', seed]);
    git(seed, ['config', 'user.email', 'test@example.com']);
    git(seed, ['config', 'user.name', 'Test']);
    writeFileSync(join(seed, 'README.md'), 'hi\n');
    git(seed, ['add', '.']);
    git(seed, ['commit', '-m', 'init']);
    git(seed, ['branch', '-M', 'main']);
    git(seed, ['remote', 'add', 'origin', remote]);
    git(seed, ['push', 'origin', 'main']);
    git(seed, ['checkout', '-b', 'openspec/issue-1']);
    writeFileSync(join(seed, 'change.md'), 'change\n');
    git(seed, ['add', '.']);
    git(seed, ['commit', '-m', 'change']);
    git(seed, ['push', 'origin', 'openspec/issue-1']);
    mkdirSync(worktrees, { recursive: true });

    const commands = new NodeCommandRunner();
    const source: RepositorySource = {
      repo: { owner: 'acme', name: 'widget' },
      async clone({ branch, destination }) {
        const result = await commands.run('git', [
          'clone',
          '--branch',
          branch,
          remote,
          destination,
        ]);
        if (result.code !== 0) throw new Error(result.stderr);
      },
      async fetch({ destination }) {
        await commands.run('git', ['-C', destination, 'fetch', '--prune', 'origin']);
      },
    };

    const provider = new FakeProvider();
    const runtime = new BaseRecordingRuntime();
    const openspec = new FakeOpenspecCli();
    openspec.markInProgress('add-x');
    provider.seedIssue({ number: 1, labels: ['openspec'] });

    const sandbox = new WorktreeSandbox({
      store: new RepositoryStore({ root: join(base, 'clones') }),
      source,
      baseBranch: 'main',
      root: worktrees,
      commands,
    });
    const poller = new Poller({
      provider,
      runtime,
      sandbox,
      openspec,
      labels: DEFAULT_LABELS,
      baseBranch: 'main',
    });

    // First turn: the base has no marker yet.
    await poller.pollOnce();
    expect(runtime.basePresent).toEqual([false]);

    // The base advances while the change is in flight.
    git(seed, ['checkout', 'main']);
    writeFileSync(join(seed, 'base-marker.md'), 'base\n');
    git(seed, ['add', '.']);
    git(seed, ['commit', '-m', 'advance base']);
    git(seed, ['push', 'origin', 'main']);

    // A new review drives a second turn, which must see the advanced base.
    provider.seedReview(100, { state: 'changes_requested', body: 'keep going' });
    openspec.markReady('add-x');
    await poller.pollOnce();

    expect(runtime.basePresent).toEqual([false, true]);
    expect(await labelsOf(provider, 100)).toContain(DEFAULT_LABELS.ready);
  });
});

const REPO_OPENSPEC = fileURLToPath(new URL('../../openspec', import.meta.url));
const CHANGE_DIR = join(REPO_OPENSPEC, 'changes', 'add-workflow-orchestrator');

function openspecAvailable(): boolean {
  try {
    execFileSync('openspec', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const ARCHIVE_TEST_ENABLED = openspecAvailable() && existsSync(CHANGE_DIR);

describe('end-to-end archive', () => {
  it.skipIf(!ARCHIVE_TEST_ENABLED)(
    'archives the change and folds its requirements into the main specs',
    () => {
      const temp = mkdtempSync(join(tmpdir(), 'orchestrator-e2e-'));
      try {
        cpSync(REPO_OPENSPEC, join(temp, 'openspec'), { recursive: true });
        execFileSync('openspec', ['archive', 'add-workflow-orchestrator', '--yes', '--json'], {
          cwd: temp,
          stdio: 'ignore',
        });

        const specsDir = join(temp, 'openspec', 'specs');
        const capabilities = readdirSync(specsDir).filter((name) => !name.startsWith('.'));
        expect(capabilities).toEqual(
          expect.arrayContaining([
            'workflow-orchestration',
            'repo-provider',
            'agent-runtime',
            'orchestrator-configuration',
          ]),
        );

        const spec = readFileSync(join(specsDir, 'workflow-orchestration', 'spec.md'), 'utf8');
        expect(spec).toContain('## Purpose');
        expect(spec).not.toContain('TBD');
      } finally {
        rmSync(temp, { recursive: true, force: true });
      }
    },
  );
});
