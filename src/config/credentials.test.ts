import { describe, expect, it } from 'vitest';

import type { CommandResult, CommandRunOptions, CommandRunner } from '../system/commands.js';
import {
  CredentialError,
  EnvCredentialResolver,
  FallbackCredentialResolver,
  GhCredentialResolver,
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

/** A `CommandRunner` that records invocations and returns a canned result. */
class StubCommands implements CommandRunner {
  readonly runs: { command: string; args: string[] }[] = [];

  constructor(private readonly result: CommandResult) {}

  async run(command: string, args: string[], _options?: CommandRunOptions): Promise<CommandResult> {
    this.runs.push({ command, args });
    return this.result;
  }
}

function ok(stdout: string): CommandResult {
  return { code: 0, stdout, stderr: '' };
}

describe('EnvCredentialResolver', () => {
  it('resolves a secret from the environment', async () => {
    const resolver = new EnvCredentialResolver({ GITHUB_TOKEN: 'secret-value' });
    await expect(
      resolver.resolve('env:GITHUB_TOKEN', { repo: 'github:acme/widget' }),
    ).resolves.toBe('secret-value');
  });

  it('fails, naming the repository, when the secret is not set', async () => {
    const resolver = new EnvCredentialResolver({});
    await expect(
      resolver.resolve('env:GITHUB_TOKEN', { repo: 'github:acme/widget' }),
    ).rejects.toMatchObject({ name: 'CredentialError', repo: 'github:acme/widget' });
  });

  it('rejects unsupported credential schemes', async () => {
    const resolver = new EnvCredentialResolver({});
    await expect(
      resolver.resolve('vault:secret/token', { repo: 'github:acme/widget' }),
    ).rejects.toThrowError(/unsupported credential scheme/);
  });
});

describe('GhCredentialResolver', () => {
  it('resolves the gh: scheme from `gh auth token`', async () => {
    const commands = new StubCommands(ok('gh-token\n'));
    const resolver = new GhCredentialResolver({ commands });
    await expect(resolver.resolve('gh:token', { repo: 'github:acme/widget' })).resolves.toBe(
      'gh-token',
    );
    expect(commands.runs[0]).toEqual({ command: 'gh', args: ['auth', 'token'] });
  });

  it('resolves an env: reference as a fallback', async () => {
    const resolver = new GhCredentialResolver({ commands: new StubCommands(ok('gh-token')) });
    await expect(
      resolver.resolve('env:GITHUB_TOKEN', { repo: 'github:acme/widget' }),
    ).resolves.toBe('gh-token');
  });

  it('fails, naming the repository, when gh is not authenticated', async () => {
    const commands = new StubCommands({ code: 1, stdout: '', stderr: 'gh: not logged in' });
    const resolver = new GhCredentialResolver({ commands });
    await expect(
      resolver.resolve('gh:token', { repo: 'github:acme/widget' }),
    ).rejects.toMatchObject({
      name: 'CredentialError',
      repo: 'github:acme/widget',
    });
  });
});

describe('FallbackCredentialResolver', () => {
  it('prefers the environment and falls back to gh when unset', async () => {
    const fromEnv = new FallbackCredentialResolver([
      new EnvCredentialResolver({ GITHUB_TOKEN: 'env-token' }),
      new GhCredentialResolver({ commands: new StubCommands(ok('gh-token')) }),
    ]);
    await expect(fromEnv.resolve('env:GITHUB_TOKEN', { repo: 'github:acme/widget' })).resolves.toBe(
      'env-token',
    );

    const fromGh = new FallbackCredentialResolver([
      new EnvCredentialResolver({}),
      new GhCredentialResolver({ commands: new StubCommands(ok('gh-token')) }),
    ]);
    await expect(fromGh.resolve('env:GITHUB_TOKEN', { repo: 'github:acme/widget' })).resolves.toBe(
      'gh-token',
    );
  });

  it('reports every attempt, naming the repository, when all resolvers fail', async () => {
    const resolver = new FallbackCredentialResolver([
      new EnvCredentialResolver({}),
      new GhCredentialResolver({
        commands: new StubCommands({ code: 1, stdout: '', stderr: 'nope' }),
      }),
    ]);
    await expect(
      resolver.resolve('env:GITHUB_TOKEN', { repo: 'github:acme/widget' }),
    ).rejects.toBeInstanceOf(CredentialError);
  });
});

describe('resolveCredentials', () => {
  it('keeps secrets out of the configuration object', async () => {
    const config = parseConfig(CONFIG);
    const serialized = JSON.stringify(config);
    expect(serialized).toContain('env:GITHUB_TOKEN');
    expect(serialized).not.toContain('secret-value');

    const resolved = await resolveCredentials(
      config,
      new EnvCredentialResolver({ GITHUB_TOKEN: 'secret-value' }),
    );
    expect(resolved.get('github:acme/widget')).toBe('secret-value');
  });
});
