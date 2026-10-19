import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NodeContainerRunner } from '../../system/commands.js';
import { buildDockerRunArgs } from '../sandbox.js';
import { resolveSdkVersion } from './sdk-version.js';

const DIST = fileURLToPath(new URL('../../../dist', import.meta.url));
const ENVIRONMENTS_DIR = fileURLToPath(new URL('../../../environments', import.meta.url));
const RUNNER_MOUNT = '/opt/runner/dist';
const IMAGE = process.env.ORCHESTRATOR_SMOKE_IMAGE ?? 'openspec-environment-node:latest';

function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * The smoke test needs Docker and a built runner (`npm run build`). When either
 * is missing - as on CI runners without Docker - it is skipped rather than
 * failed.
 */
const ENABLED = dockerAvailable() && existsSync(join(DIST, 'runner.js'));

let tempDir: string | undefined;

beforeAll(() => {
  if (!ENABLED) return;
  try {
    execFileSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore', timeout: 10_000 });
  } catch {
    // Not present: build the plain Node.js flavour. It has no default SDK
    // version, so pass the orchestrator's own.
    execFileSync(
      'docker',
      [
        'build',
        '--build-arg',
        `OPENCODE_SDK_VERSION=${resolveSdkVersion()}`,
        '--target',
        'node',
        '-t',
        IMAGE,
        ENVIRONMENTS_DIR,
      ],
      { stdio: 'inherit', timeout: 10 * 60 * 1000 },
    );
  }
  tempDir = mkdtempSync(join(tmpdir(), 'orchestrator-smoke-'));
});

afterAll(() => {
  if (tempDir !== undefined) rmSync(tempDir, { recursive: true, force: true });
});

describe('container smoke test', () => {
  it.skipIf(!ENABLED)(
    'runs the turn runner in a real environment image and fails fast on SDK drift',
    async () => {
      const dir = tempDir ?? tmpdir();
      const args = buildDockerRunArgs({
        image: IMAGE,
        workspace: dir,
        store: dir,
        runner: DIST,
        runnerMount: RUNNER_MOUNT,
        command: ['node', join(RUNNER_MOUNT, 'runner.js')],
        env: [],
      });

      const result = await new NodeContainerRunner().run({
        args,
        input: JSON.stringify({
          skill: 'propose',
          prompt: 'smoke test',
          workspace: dir,
          // A deliberately stale version exercises the runner's fail-fast check
          // without needing provider credentials.
          expectedSdkVersion: '0.0.0',
        }),
      });

      expect(result.code).toBe(1);
      const events = result.stdout
        .trim()
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line) as { type: string; sdkVersion?: string; error?: string });

      expect(events[0]).toEqual({ type: 'ready', sdkVersion: resolveSdkVersion() });
      expect(events.at(-1)?.type).toBe('error');
      expect(events.at(-1)?.error).toContain('does not match');
    },
  );
});
