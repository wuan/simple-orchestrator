import { describe, expect, it } from 'vitest';

import { GhCliTransport } from './gh-cli.js';
import { GitHubApiError } from './transport.js';
import { RecordingCommands } from './testing/recording-commands.js';

function ok(stdout: string) {
  return { code: 0, stdout, stderr: '' };
}

describe('GhCliTransport.json', () => {
  it('runs `gh api` with the method and path, and parses JSON', async () => {
    const commands = new RecordingCommands(ok(JSON.stringify({ login: 'octocat' })));
    const transport = new GhCliTransport({ commands });

    const result = await transport.json<{ login: string }>('GET', '/user');
    expect(result.data).toEqual({ login: 'octocat' });
    expect(commands.runs[0]?.command).toBe('gh');
    expect(commands.runs[0]?.args).toEqual(['api', '--method', 'GET', '/user']);
  });

  it('passes GET query values as raw fields', async () => {
    const commands = new RecordingCommands(ok('[]'));
    const transport = new GhCliTransport({ commands });

    await transport.json('GET', '/repos/acme/widget/issues', {
      query: { state: 'open', labels: 'openspec' },
    });
    expect(commands.runs[0]?.args).toEqual([
      'api',
      '--method',
      'GET',
      '--raw-field',
      'state=open',
      '--raw-field',
      'labels=openspec',
      '/repos/acme/widget/issues',
    ]);
  });

  it('sends a request body over stdin', async () => {
    const commands = new RecordingCommands(ok(JSON.stringify({ number: 1 })));
    const transport = new GhCliTransport({ commands });

    await transport.json('POST', '/repos/acme/widget/pulls', { body: { title: 'hi' } });
    expect(commands.runs[0]?.args).toContain('--input');
    expect(commands.runs[0]?.stdin).toBe(JSON.stringify({ title: 'hi' }));
  });

  it('exports the resolved token as GH_TOKEN', async () => {
    const commands = new RecordingCommands(ok('{}'));
    const transport = new GhCliTransport({ commands, token: 'secret-token' });

    await transport.json('GET', '/user');
    expect(commands.runs[0]?.env?.['GH_TOKEN']).toBe('secret-token');
  });

  it('maps a gh failure to a typed error with the HTTP status', async () => {
    const commands = new RecordingCommands({
      code: 1,
      stdout: '',
      stderr: 'gh: Not Found (HTTP 404)',
    });
    const transport = new GhCliTransport({ commands });

    await expect(transport.json('GET', '/missing')).rejects.toMatchObject({
      name: 'GitHubApiError',
      status: 404,
    });
    await expect(transport.json('GET', '/missing')).rejects.toBeInstanceOf(GitHubApiError);
  });
});

describe('GhCliTransport.paginate', () => {
  it('requests every page and flattens the slurped response', async () => {
    const commands = new RecordingCommands(ok(JSON.stringify([[1, 2], [3]])));
    const transport = new GhCliTransport({ commands });

    const items = await transport.paginate<number>('/items', { state: 'all' });
    expect(items).toEqual([1, 2, 3]);
    expect(commands.runs[0]?.args).toEqual([
      'api',
      '--method',
      'GET',
      '--paginate',
      '--slurp',
      '--raw-field',
      'state=all',
      '/items',
    ]);
  });

  it('returns an empty list for empty output', async () => {
    const transport = new GhCliTransport({ commands: new RecordingCommands(ok('')) });
    await expect(transport.paginate('/items')).resolves.toEqual([]);
  });
});
