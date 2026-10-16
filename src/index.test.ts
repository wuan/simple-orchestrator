import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EnvCredentialResolver } from './config/credentials.js';
import { main, parseCliArgs } from './index.js';

const FAKE_CONFIG = `
repositories:
  - provider: fake
    owner: acme
    name: widget
    credential: env:ANY_VALUE
`;

function collect(): { sink: string[]; write: (text: string) => void } {
  const sink: string[] = [];
  return { sink, write: (text: string) => void sink.push(text) };
}

describe('parseCliArgs', () => {
  it('parses --config and --once', () => {
    expect(parseCliArgs(['--config', 'a.yaml', '--once'])).toEqual({
      config: 'a.yaml',
      once: true,
      verbose: false,
      help: false,
    });
  });

  it('parses --verbose and its short form -v', () => {
    expect(parseCliArgs(['--config', 'a.yaml', '--verbose']).verbose).toBe(true);
    expect(parseCliArgs(['--config', 'a.yaml', '-v']).verbose).toBe(true);
    expect(parseCliArgs(['--config', 'a.yaml']).verbose).toBe(false);
  });

  it('rejects unknown arguments', () => {
    expect(() => parseCliArgs(['--wat'])).toThrowError(/unknown argument/);
  });
});

describe('main', () => {
  it('prints usage for --help', async () => {
    const out = collect();
    const code = await main(['--help'], { stdout: out.write });
    expect(code).toBe(0);
    expect(out.sink.join('')).toContain('Usage');
  });

  it('requires --config', async () => {
    const err = collect();
    const code = await main([], { stderr: err.write });
    expect(code).toBe(2);
    expect(err.sink.join('')).toContain("'--config' is required");
  });

  it('fails fast when the config file cannot be read', async () => {
    const err = collect();
    const code = await main(['--config', '/definitely/missing.yaml'], { stderr: err.write });
    expect(code).toBe(1);
    expect(err.sink.join('')).toContain('configuration error');
  });

  it('starts and completes a poll cycle with the fake provider', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchestrator-cli-'));
    try {
      const configPath = join(dir, 'config.yaml');
      writeFileSync(configPath, FAKE_CONFIG);
      const out = collect();
      const code = await main(['--config', configPath, '--once'], {
        env: { ANY_VALUE: '1' },
        stdout: out.write,
      });
      expect(code).toBe(0);
      expect(out.sink.join('')).toContain('fake:acme/widget');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stays concise by default: no poll diagnostics on stderr', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchestrator-cli-'));
    try {
      const configPath = join(dir, 'config.yaml');
      writeFileSync(configPath, FAKE_CONFIG);
      const out = collect();
      const err = collect();
      const code = await main(['--config', configPath, '--once'], {
        env: { ANY_VALUE: '1' },
        stdout: out.write,
        stderr: err.write,
      });
      expect(code).toBe(0);
      expect(out.sink.join('')).toContain('fake:acme/widget');
      expect(err.sink.join('')).not.toContain('polling');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('enables verbose diagnostics from the command-line option', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchestrator-cli-'));
    try {
      const configPath = join(dir, 'config.yaml');
      writeFileSync(configPath, FAKE_CONFIG);
      const out = collect();
      const err = collect();
      const code = await main(['--config', configPath, '--once', '--verbose'], {
        env: { ANY_VALUE: '1' },
        stdout: out.write,
        stderr: err.write,
      });
      expect(code).toBe(0);
      expect(err.sink.join('')).toContain('polling fake:acme/widget');
      // The machine-readable report on stdout stays clean.
      expect(out.sink.join('')).not.toContain('polling');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('enables verbose diagnostics from the configuration file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchestrator-cli-'));
    try {
      const configPath = join(dir, 'config.yaml');
      writeFileSync(configPath, `${FAKE_CONFIG}\nlogging:\n  verbose: true\n`);
      const out = collect();
      const err = collect();
      const code = await main(['--config', configPath, '--once'], {
        env: { ANY_VALUE: '1' },
        stdout: out.write,
        stderr: err.write,
      });
      expect(code).toBe(0);
      expect(err.sink.join('')).toContain('polling fake:acme/widget');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never writes the resolved credential value to verbose output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchestrator-cli-'));
    try {
      const configPath = join(dir, 'config.yaml');
      writeFileSync(configPath, FAKE_CONFIG);
      const out = collect();
      const err = collect();
      const code = await main(['--config', configPath, '--once', '--verbose'], {
        env: { ANY_VALUE: 'top-secret-token-value' },
        stdout: out.write,
        stderr: err.write,
      });
      expect(code).toBe(0);
      const combined = `${out.sink.join('')}${err.sink.join('')}`;
      expect(combined).toContain('polling fake:acme/widget');
      expect(combined).not.toContain('top-secret-token-value');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails fast, naming the repository, when a credential is unset', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orchestrator-cli-'));
    try {
      const configPath = join(dir, 'config.yaml');
      writeFileSync(
        configPath,
        `
repositories:
  - provider: github
    owner: acme
    name: widget
    credential: env:MISSING_TOKEN
`,
      );
      const err = collect();
      const code = await main(['--config', configPath, '--once'], {
        env: {},
        serviceOptions: { credentials: new EnvCredentialResolver({}) },
        stderr: err.write,
      });
      expect(code).toBe(1);
      expect(err.sink.join('')).toContain('acme/widget');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
