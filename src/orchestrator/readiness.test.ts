import { describe, expect, it } from 'vitest';

import { evaluateReadiness } from './readiness.js';
import { FakeOpenspecCli } from './testing/fake-openspec.js';

describe('evaluateReadiness', () => {
  it('is ready when the single change has all artifacts done and validates', async () => {
    const cli = new FakeOpenspecCli();
    cli.markReady('add-x');
    expect(await evaluateReadiness(cli, '/w')).toMatchObject({ ready: true, changeName: 'add-x' });
  });

  it('is not ready when an artifact is unfinished', async () => {
    const cli = new FakeOpenspecCli();
    cli.markInProgress('add-x');
    expect((await evaluateReadiness(cli, '/w')).ready).toBe(false);
  });

  it('is not ready when strict validation fails', async () => {
    const cli = new FakeOpenspecCli();
    cli.markReady('add-x');
    cli.validations.set('add-x', { valid: false, output: 'duplicate header' });
    expect((await evaluateReadiness(cli, '/w')).ready).toBe(false);
  });

  it('is not ready when there is no change', async () => {
    const cli = new FakeOpenspecCli();
    expect((await evaluateReadiness(cli, '/w')).ready).toBe(false);
  });

  it('is not ready when there is more than one change', async () => {
    const cli = new FakeOpenspecCli();
    cli.markReady('add-x');
    cli.markReady('add-y');
    cli.changes = [{ name: 'add-x' }, { name: 'add-y' }];
    expect((await evaluateReadiness(cli, '/w')).ready).toBe(false);
  });
});
