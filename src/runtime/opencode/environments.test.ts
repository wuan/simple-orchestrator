import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const DOCKERFILE = fileURLToPath(new URL('../../../environments/Dockerfile', import.meta.url));
const README = fileURLToPath(new URL('../../../environments/README.md', import.meta.url));
const WORKFLOW = fileURLToPath(
  new URL('../../../.github/workflows/environments.yml', import.meta.url),
);

function dockerfile(): string {
  return readFileSync(DOCKERFILE, 'utf8');
}

/** The publishable flavours: every stage built directly on the shared base. */
function flavours(): string[] {
  return [...dockerfile().matchAll(/^FROM base AS (\S+)$/gm)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
}

interface Workflow {
  jobs?: Record<
    string,
    {
      needs?: string[];
      outputs?: Record<string, string>;
      strategy?: { matrix?: Record<string, unknown> };
      steps?: { id?: string; uses?: string; run?: string; with?: Record<string, unknown> }[];
    }
  >;
}

describe('environment image flavours', () => {
  it('builds every flavour on the shared base that meets the image contract', () => {
    const text = dockerfile();

    // The contract - Node 24, git, and the pinned SDK - is installed once, in
    // base, so no flavour can drift from it.
    expect(text).toMatch(/^FROM node:24\S* AS base$/m);
    expect(text).toContain('@opencode/sdk@${OPENCODE_SDK_VERSION}');
    expect(text).toMatch(/install -y --no-install-recommends[\s\S]*\bgit\b/);

    // The plain Node.js flavour is the base itself; the Rust flavour adds the
    // toolchain bo-srv-rs needs.
    expect(flavours()).toContain('node');
    expect(flavours()).toContain('rust');
    expect(dockerfile()).toMatch(/^FROM base AS node$/m);
  });

  it('documents the image contract and the read-only runner mount', () => {
    const readme = readFileSync(README, 'utf8');
    expect(readme).toContain('/opt/runner/dist');
    expect(readme).toContain('@opencode/sdk');
  });

  it('fails fast when the SDK build argument is missing', () => {
    // A stale default would silently bake the wrong SDK, so base rejects an
    // empty build argument instead.
    expect(dockerfile()).toContain('test -n "$OPENCODE_SDK_VERSION"');
    expect(dockerfile()).not.toMatch(/^ARG OPENCODE_SDK_VERSION=/m);
  });

  it('publishes exactly the flavours the Dockerfile defines', () => {
    const workflow = parse(readFileSync(WORKFLOW, 'utf8')) as Workflow;
    const job = workflow.jobs?.build;

    // The matrix is derived from the Dockerfile at run time, so there is no
    // second, drifting list to keep in sync.
    expect(job?.needs).toContain('flavours');
    expect(job?.strategy?.matrix?.flavour).toBe('${{ fromJSON(needs.flavours.outputs.list) }}');
    expect(workflow.jobs?.flavours?.outputs?.list).toContain('steps.discover.outputs.list');

    const buildStep = job?.steps?.find((step) => step.with?.target === '${{ matrix.flavour }}');
    expect(buildStep?.with?.context).toBe('environments');
  });

  it('publishes every flavour for both amd64 and arm64', () => {
    const workflow = parse(readFileSync(WORKFLOW, 'utf8')) as Workflow;
    const steps = workflow.jobs?.build?.steps ?? [];

    // The runner is amd64, so the build registers QEMU to emulate arm64 and
    // buildx emits a single index covering both supported platforms.
    expect(steps.some((step) => step.uses?.startsWith('docker/setup-qemu-action'))).toBe(true);

    const buildStep = steps.find((step) => step.with?.target === '${{ matrix.flavour }}');
    const platforms = String(buildStep?.with?.platforms ?? '')
      .split(',')
      .map((platform) => platform.trim());
    expect(platforms).toContain('linux/amd64');
    expect(platforms).toContain('linux/arm64');

    // The platform set lives only on the build step; the flavour matrix still
    // comes from the Dockerfile stages rather than a second, driftable list.
    expect(workflow.jobs?.build?.strategy?.matrix?.flavour).toBe(
      '${{ fromJSON(needs.flavours.outputs.list) }}',
    );
  });

  it('gives the Rust flavour the OpenSSL development package', () => {
    const text = dockerfile();
    const base = text.slice(text.indexOf('FROM node:24'), text.indexOf('FROM base AS node'));
    const node = text.slice(text.indexOf('FROM base AS node'), text.indexOf('FROM base AS rust'));
    const rust = text.slice(text.indexOf('FROM base AS rust'));

    // A Rust dependency tree that links the system OpenSSL (native-tls) needs
    // the development headers; the package stays in the Rust stage so the
    // shared contract and the node flavour are unchanged.
    expect(rust).toMatch(/apt-get install[^\n]*\blibssl-dev\b/);
    expect(base).not.toMatch(/apt-get install[^\n]*\blibssl-dev\b/);
    expect(node).not.toMatch(/apt-get install[^\n]*\blibssl-dev\b/);
  });

  it('discovers the flavours from the Dockerfile and passes the lockfile SDK', () => {
    const workflow = parse(readFileSync(WORKFLOW, 'utf8')) as Workflow;
    const discovery = workflow.jobs?.flavours?.steps?.find((step) => step.id === 'discover');
    expect(discovery?.run).toContain('FROM base AS');

    const resolve = workflow.jobs?.build?.steps?.find((step) => step.id === 'sdk');
    expect(resolve?.run).toContain('package-lock.json');

    const buildStep = workflow.jobs?.build?.steps?.find((step) =>
      Object.hasOwn(step.with ?? {}, 'build-args'),
    );
    expect(buildStep?.with?.['build-args']).toContain(
      'OPENCODE_SDK_VERSION=${{ steps.sdk.outputs.version }}',
    );
  });
});
