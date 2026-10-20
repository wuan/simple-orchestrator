import { describe, expect, it } from 'vitest';

import type { CommandResult, CommandRunOptions, CommandRunner } from './commands.js';
import { GhCliTransport } from './gh-cli.js';
import { GitHubApiError } from './transport.js';
import { RecordingCommands } from './testing/recording-commands.js';

function ok(stdout: string) {
  return { code: 0, stdout, stderr: '' };
}

const notFound = { code: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' };

/** Returns the given results in order, one per invocation. */
class SequencedCommands implements CommandRunner {
  readonly runs: { args: string[]; env: NodeJS.ProcessEnv | undefined }[] = [];

  constructor(private readonly results: CommandResult[]) {}

  run(_command: string, args: string[], options: CommandRunOptions = {}): Promise<CommandResult> {
    this.runs.push({ args, env: options.env });
    const result = this.results.shift();
    return result === undefined
      ? Promise.reject(new Error('unexpected command'))
      : Promise.resolve(result);
  }
}

function repoResponse(permissions: Record<string, boolean> | undefined, scopes?: string): string {
  const headers = ['HTTP/2.0 200 OK', 'Content-Type: application/json'];
  if (scopes !== undefined) headers.push(`X-Oauth-Scopes: ${scopes}`);
  return `${headers.join('\r\n')}\r\n\r\n${JSON.stringify({ full_name: 'acme/widget', permissions })}`;
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

describe('GhCliTransport permission report', () => {
  it('reports missing push access when a write is refused with 404', async () => {
    const commands = new SequencedCommands([
      notFound,
      ok(repoResponse({ admin: false, push: false, pull: true }, 'public_repo')),
    ]);
    const transport = new GhCliTransport({ commands, token: 'secret-token' });

    const error = await transport
      .json('POST', '/repos/acme/widget/git/commits', { body: {} })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GitHubApiError);
    expect(error).toMatchObject({ status: 404 });
    const message = (error as GitHubApiError).message;
    expect(message).toContain('gh api POST /repos/acme/widget/git/commits failed');
    expect(message).toContain('no push access to acme/widget (permissions: pull)');
    expect(message).toContain('token scopes: public_repo');
    expect(commands.runs[1]?.args).toEqual(['api', '--include', '/repos/acme/widget']);
    expect(commands.runs[1]?.env?.['GH_TOKEN']).toBe('secret-token');
  });

  it('names a missing repo scope on a classic token', async () => {
    const commands = new SequencedCommands([
      notFound,
      ok(repoResponse({ admin: true, push: true, pull: true }, 'gist, read:org')),
    ]);
    const transport = new GhCliTransport({ commands });

    await expect(
      transport.json('POST', '/repos/acme/widget/git/commits', { body: {} }),
    ).rejects.toThrow(/lacks the 'repo' scope/);
  });

  it('says so when a classic token may already write', async () => {
    const commands = new SequencedCommands([
      notFound,
      ok(repoResponse({ admin: true, push: true, pull: true }, 'repo, workflow')),
    ]);
    const transport = new GhCliTransport({ commands });

    await expect(
      transport.json('POST', '/repos/acme/widget/git/commits', { body: {} }),
    ).rejects.toThrow(/likely not a permission problem/);
  });

  it('points at a restricted token when the account itself may push', async () => {
    const commands = new SequencedCommands([
      notFound,
      ok(repoResponse({ admin: true, push: true, pull: true })),
    ]);
    const transport = new GhCliTransport({ commands });

    await expect(
      transport.json('PATCH', '/repos/acme/widget/git/refs/heads/x', { body: {} }),
    ).rejects.toThrow(/push access to acme\/widget .*fine-grained token or GitHub App/);
  });

  it('reports a repository the credential cannot see', async () => {
    const commands = new SequencedCommands([notFound, ok(repoResponse(undefined))]);
    const transport = new GhCliTransport({ commands });

    await expect(transport.json('POST', '/repos/acme/widget/pulls', { body: {} })).rejects.toThrow(
      /reports no permissions for this credential on acme\/widget/,
    );
  });

  it('keeps the original error when the check itself fails', async () => {
    const commands = new SequencedCommands([notFound, notFound]);
    const transport = new GhCliTransport({ commands });

    await expect(transport.json('POST', '/repos/acme/widget/pulls', { body: {} })).rejects.toThrow(
      /failed: gh: Not Found \(HTTP 404\); permission check: could not read acme\/widget/,
    );
  });

  it('does not check reads or other failures', async () => {
    const commands = new SequencedCommands([
      notFound,
      { code: 1, stdout: '', stderr: 'gh: Validation Failed (HTTP 422)' },
    ]);
    const transport = new GhCliTransport({ commands });

    await expect(transport.json('GET', '/repos/acme/widget/issues/1')).rejects.toThrow(
      /failed: gh: Not Found \(HTTP 404\)$/,
    );
    await expect(
      transport.json('POST', '/repos/acme/widget/git/refs', { body: {} }),
    ).rejects.toMatchObject({ status: 422 });
    expect(commands.runs).toHaveLength(2);
  });
});

describe('GhCliTransport.graphql', () => {
  it('runs `gh api graphql` over stdin and keeps the token out of argv', async () => {
    const commands = new RecordingCommands(ok(JSON.stringify({ data: { ok: true } })));
    const transport = new GhCliTransport({ commands, token: 'secret-token' });

    const data = await transport.graphql<{ ok: boolean }>('mutation { x }', { id: 1 });

    expect(data).toEqual({ ok: true });
    expect(commands.runs[0]?.command).toBe('gh');
    expect(commands.runs[0]?.args).toEqual(['api', 'graphql', '--input', '-']);
    expect(commands.runs[0]?.stdin).toBe(
      JSON.stringify({ query: 'mutation { x }', variables: { id: 1 } }),
    );
    expect(commands.runs[0]?.args.join(' ')).not.toContain('secret-token');
    expect(commands.runs[0]?.env?.['GH_TOKEN']).toBe('secret-token');
  });

  it('maps a GraphQL error to a typed error', async () => {
    const commands = new RecordingCommands(
      ok(JSON.stringify({ errors: [{ message: 'Could not resolve to a node' }] })),
    );
    const transport = new GhCliTransport({ commands });

    await expect(transport.graphql('mutation { x }')).rejects.toMatchObject({
      name: 'GitHubApiError',
    });
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
