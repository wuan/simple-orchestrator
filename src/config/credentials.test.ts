import { describe, expect, it } from 'vitest';

import {
  CredentialError,
  EnvCredentialResolver,
  resolveCredentials,
} from './credentials.js';
import { parseConfig } from './loader.js';

const CONFIG = `
repositories:
  - provider: github
    owner: acme
    name: widget
    credential: env:GITHUB_TOKEN
`;

describe('EnvCredentialResolver', () => {
  it('resolves a secret from the environment', () => {
    const resolver = new EnvCredentialResolver({ GITHUB_TOKEN: 'secret-value' });
    expect(resolver.resolve('env:GITHUB_TOKEN', { repo: 'github:acme/widget' })).toBe('secret-value');
  });

  it('fails, naming the repository, when the secret is not set', () => {
    const resolver = new EnvCredentialResolver({});
    try {
      resolver.resolve('env:GITHUB_TOKEN', { repo: 'github:acme/widget' });
      throw new Error('expected resolve to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CredentialError);
      expect((error as CredentialError).repo).toBe('github:acme/widget');
      expect((error as Error).message).toContain('acme/widget');
    }
  });

  it('rejects unsupported credential schemes', () => {
    const resolver = new EnvCredentialResolver({});
    expect(() => resolver.resolve('vault:secret/token', { repo: 'github:acme/widget' })).toThrowError(
      /unsupported credential scheme/,
    );
  });
});

describe('resolveCredentials', () => {
  it('keeps secrets out of the configuration object', () => {
    const config = parseConfig(CONFIG);
    const serialized = JSON.stringify(config);
    expect(serialized).toContain('env:GITHUB_TOKEN');
    expect(serialized).not.toContain('secret-value');

    const resolved = resolveCredentials(
      config,
      new EnvCredentialResolver({ GITHUB_TOKEN: 'secret-value' }),
    );
    expect(resolved.get('github:acme/widget')).toBe('secret-value');
  });
});
