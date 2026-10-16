import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEFAULT_LABELS } from '../config/types.js';
import type { TurnResult } from '../domain/types.js';
import { FakeProvider } from '../provider/fake/fake-provider.js';
import { FakeRuntime } from '../runtime/fake/fake-runtime.js';
import { Poller } from './poller.js';
import { FakeOpenspecCli } from './testing/fake-openspec.js';
import { FakeSandbox } from './testing/fake-sandbox.js';

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
