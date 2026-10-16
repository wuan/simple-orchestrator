import { describe, expect, it } from 'vitest';

import { GhCliCloner, TokenCloner } from './clone.js';
import { RecordingCommands } from './testing/recording-commands.js';

describe('TokenCloner', () => {
  it('clones with the token in git config, never in argv', async () => {
    const commands = new RecordingCommands();
    const cloner = new TokenCloner({
      owner: 'acme',
      name: 'widget',
      token: 'secret-token',
      commands,
      gitBaseUrl: 'https://github.com',
    });

    await cloner.clone({ branch: 'openspec/issue-7', destination: '/tmp/work' });
    const [run] = commands.runs;
    expect(run?.command).toBe('git');
    expect(run?.args).toContain('openspec/issue-7');
    expect(run?.args).toContain('/tmp/work');
    expect(run?.args.join(' ')).not.toContain('secret-token');
    expect(run?.env?.['GIT_CONFIG_VALUE_0']).toContain('secret-token');
  });
});

describe('GhCliCloner', () => {
  it('clones through `gh repo clone` with git flags after `--`', async () => {
    const commands = new RecordingCommands();
    const cloner = new GhCliCloner({ owner: 'acme', name: 'widget', commands, token: 'secret-token' });

    await cloner.clone({ branch: 'openspec/issue-7', destination: '/tmp/work' });
    const [run] = commands.runs;
    expect(run?.command).toBe('gh');
    expect(run?.args).toEqual([
      'repo',
      'clone',
      'acme/widget',
      '/tmp/work',
      '--',
      '--branch',
      'openspec/issue-7',
      '--single-branch',
      '--depth',
      '1',
    ]);
    expect(run?.env?.['GH_TOKEN']).toBe('secret-token');
    expect(run?.args.join(' ')).not.toContain('secret-token');
  });

  it('qualifies the slug with the hostname for GitHub Enterprise', async () => {
    const commands = new RecordingCommands();
    const cloner = new GhCliCloner({ owner: 'acme', name: 'widget', commands, hostname: 'ghe.example.com' });

    await cloner.clone({ branch: 'main', destination: '/tmp/work' });
    expect(commands.runs[0]?.args[2]).toBe('ghe.example.com/acme/widget');
  });
});
