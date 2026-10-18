import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { resolveSdkVersion } from './sdk-version.js';

const DOCKERFILE = fileURLToPath(
  new URL('../../../examples/environment/Dockerfile', import.meta.url),
);
const README = fileURLToPath(new URL('../../../examples/environment/README.md', import.meta.url));

describe('example environment image', () => {
  it('installs the pinned @opencode/sdk for the image platform', () => {
    const dockerfile = readFileSync(DOCKERFILE, 'utf8');
    const pin = /ARG OPENCODE_SDK_VERSION=(\S+)/.exec(dockerfile)?.[1];

    // The documented image pin must match the orchestrator's installed SDK.
    expect(pin).toBe(resolveSdkVersion());
    expect(dockerfile).toContain('FROM node:24');
    expect(dockerfile).toContain('git');
    expect(dockerfile).toContain('@opencode/sdk@${OPENCODE_SDK_VERSION}');
  });

  it('documents the read-only runner mount at /opt/runner/dist', () => {
    expect(readFileSync(DOCKERFILE, 'utf8')).toContain('/opt/runner/dist');
    expect(readFileSync(README, 'utf8')).toContain('/opt/runner/dist');
  });
});
