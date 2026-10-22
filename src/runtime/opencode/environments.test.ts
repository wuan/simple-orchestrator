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

/** Each flavour stage's Dockerfile text, up to the next `FROM base AS` stage. */
function flavourStages(): Record<string, string> {
  const text = dockerfile();
  const starts = [...text.matchAll(/^FROM base AS (\S+)$/gm)].map((match) => ({
    name: match[1] as string,
    index: match.index,
  }));
  const stages: Record<string, string> = {};
  starts.forEach((stage, i) => {
    const end = i + 1 < starts.length ? (starts[i + 1]?.index ?? text.length) : text.length;
    stages[stage.name] = text.slice(stage.index, end);
  });
  return stages;
}

interface Workflow {
  jobs?: Record<
    string,
    {
      needs?: string[];
      outputs?: Record<string, string>;
      permissions?: Record<string, string>;
      strategy?: { matrix?: Record<string, unknown> };
      steps?: {
        id?: string;
        if?: string;
        uses?: string;
        run?: string;
        with?: Record<string, unknown>;
      }[];
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
    // toolchain bo-srv-rs needs; the Android flavour adds the JDK and SDK.
    expect(flavours()).toContain('node');
    expect(flavours()).toContain('rust');
    expect(flavours()).toContain('android');
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
    expect(job?.strategy?.matrix?.include).toBe('${{ fromJSON(needs.flavours.outputs.matrix) }}');
    expect(workflow.jobs?.flavours?.outputs?.matrix).toContain('steps.discover.outputs.matrix');

    const buildStep = job?.steps?.find((step) => step.with?.target === '${{ matrix.flavour }}');
    expect(buildStep?.with?.context).toBe('environments');
  });

  it('derives each flavour platform set from the Dockerfile', () => {
    const text = dockerfile();
    const workflow = parse(readFileSync(WORKFLOW, 'utf8')) as Workflow;
    const steps = workflow.jobs?.build?.steps ?? [];

    // A flavour stage declares the platforms it supports in the comment block
    // above it; `android` declares linux/amd64 because Google publishes the
    // Linux Android SDK tools for x86_64 only.
    expect(text).toMatch(/^# platforms: linux\/amd64$/m);

    // The discovery parses the declaration and defaults an undeclared flavour
    // to both supported platforms.
    const discovery = workflow.jobs?.flavours?.steps?.find((step) => step.id === 'discover');
    expect(discovery?.run).toContain('# platforms:');
    expect(discovery?.run).toContain('linux/amd64,linux/arm64');

    // The runner is amd64, so the build registers QEMU to emulate arm64 for a
    // multi-platform flavour.
    expect(steps.some((step) => step.uses?.startsWith('docker/setup-qemu-action'))).toBe(true);

    // The build reads the flavour's platform set from the discovery matrix and
    // keeps a pull request on the runner's native platform only.
    const buildStep = steps.find((step) => step.id === 'build');
    const platforms = buildStep?.with?.platforms;
    expect(platforms).toContain('matrix.platforms');
    expect(platforms).toContain('linux/amd64');
    expect(platforms).toContain('pull_request');
  });

  it('keeps the attestation manifests out of the published image index', () => {
    const workflow = parse(readFileSync(WORKFLOW, 'utf8')) as Workflow;
    const buildStep = workflow.jobs?.build?.steps?.find((step) => step.id === 'build');

    // buildx wraps provenance and SBOM in `unknown/unknown` index manifests by
    // default; disabling both keeps a published index to the two platforms.
    expect(buildStep?.with?.provenance).toBe(false);
    expect(buildStep?.with?.sbom).toBe(false);
  });

  it('attests the published digest outside the index on non-pull-request runs', () => {
    const workflow = parse(readFileSync(WORKFLOW, 'utf8')) as Workflow;
    const job = workflow.jobs?.build;
    const steps = job?.steps ?? [];

    // Keyless signing needs an OIDC token and the attestation API a write scope.
    expect(job?.permissions?.['id-token']).toBe('write');
    expect(job?.permissions?.['attestations']).toBe('write');

    // The SBOM and the provenance are attached to the digest the build pushed,
    // in the registry's attestation storage.
    const sbomAttest = steps.find((step) => step.uses?.startsWith('actions/attest@'));
    const provenanceAttest = steps.find((step) =>
      step.uses?.startsWith('actions/attest-build-provenance'),
    );
    for (const step of [sbomAttest, provenanceAttest]) {
      expect(step?.with?.['subject-name']).toBe(
        'ghcr.io/${{ github.repository }}/${{ matrix.flavour }}',
      );
      expect(step?.with?.['subject-digest']).toBe('${{ steps.build.outputs.digest }}');
      expect(step?.with?.['push-to-registry']).toBe(true);
    }
    expect(sbomAttest?.with?.['sbom-path']).toBeDefined();

    // The SBOM is generated from the pushed image, and no attestation runs on a
    // pull request, which publishes nothing.
    expect(
      steps.some(
        (step) =>
          step.uses?.startsWith('anchore/sbom-action') &&
          step.with?.image ===
            'ghcr.io/${{ github.repository }}/${{ matrix.flavour }}@${{ steps.build.outputs.digest }}',
      ),
    ).toBe(true);

    const attestationSteps = steps.filter((step) => /(attest|sbom-action)/.test(step.uses ?? ''));
    expect(attestationSteps.length).toBeGreaterThan(0);
    for (const step of attestationSteps) {
      expect(step.if).toBe("github.event_name != 'pull_request'");
    }
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

  it('installs the JDK and Android SDK in the android flavour only', () => {
    const text = dockerfile();
    const stages = flavourStages();
    const android = stages.android;

    // The android stage provides the JDK and the Android SDK command-line
    // tools a Gradle Android build needs, with the SDK exposed through the
    // variables such a build reads and usable by an arbitrary uid.
    expect(android).toBeDefined();
    expect(android).toMatch(/apt-get install[^\n]*\bopenjdk-17-jdk\b/);
    expect(android).toContain('sdkmanager');
    expect(android).toContain('ANDROID_HOME=/opt/android-sdk');
    expect(android).toContain('ANDROID_SDK_ROOT=/opt/android-sdk');
    expect(android).toMatch(/chmod -R a\+rwX "\$ANDROID_HOME"/);
    expect(android).toContain('platform-tools');

    // The toolchain stays in the android flavour: the shared contract and the
    // node and rust flavours are unchanged.
    const base = text.slice(text.indexOf('FROM node:24'), text.indexOf('FROM base AS node'));
    for (const stage of [base, stages.node, stages.rust]) {
      expect(stage).not.toMatch(/apt-get install[^\n]*\bopenjdk\b/);
      expect(stage).not.toContain('ANDROID_HOME');
    }
  });

  it('installs PlatformIO and the embedded gate tools in the platformio flavour only', () => {
    const text = dockerfile();
    const stages = flavourStages();
    const platformio = stages.platformio;

    // The platformio stage provides PlatformIO Core in a virtual environment,
    // the coverage tool the native test report uses, and the pinned
    // formatting and lint tools the repository's commit gate expects, with
    // PlatformIO's core directory exposed as a cache path and the environment
    // usable by an arbitrary uid.
    expect(flavours()).toContain('platformio');
    expect(platformio).toBeDefined();
    expect(platformio).toMatch(/apt-get install[^\n]*\bpython3-venv\b/);
    expect(platformio).toMatch(/apt-get install[^\n]*\blcov\b/);
    expect(platformio).toMatch(/apt-get install[^\n]*\bshellcheck\b/);
    expect(platformio).toContain('platformio==${PLATFORMIO_VERSION}');
    expect(platformio).toContain('clang-format==${CLANG_FORMAT_VERSION}');
    expect(platformio).toContain('PLATFORMIO_CORE_DIR=/tmp/.platformio');
    expect(platformio).toContain('/opt/platformio/bin');
    expect(platformio).toMatch(/chmod -R a\+rwX \/opt\/platformio/);

    // The toolchain stays in the platformio flavour: the shared contract and
    // the node, rust, and android flavours do not carry it.
    const base = text.slice(text.indexOf('FROM node:24'), text.indexOf('FROM base AS node'));
    for (const stage of [base, stages.node, stages.rust, stages.android]) {
      expect(stage).not.toContain('PLATFORMIO_CORE_DIR');
      expect(stage).not.toContain('/opt/platformio');
    }
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
