import { describe, expect, it } from 'vitest';

import type { SessionModel } from './sdk-client.js';
import {
  assertTurnSucceeded,
  createEmbeddedHostFactory,
  finalAssistantText,
  parseModelRef,
  type SdkLoader,
} from './sdk-host.js';

interface RecordedCall {
  sessionID: string;
  text?: string;
  signal?: AbortSignal;
}
interface FakePart {
  type?: string;
  text?: string;
}
interface FakeMessage {
  type?: string;
  content?: ReadonlyArray<FakePart>;
  finish?: string;
  outcome?: string;
  error?: { message?: string };
}
type Transcript = ReadonlyArray<FakeMessage>;

function fakeSdk(transcripts: Transcript[]) {
  const calls = {
    createOptions: [] as unknown[],
    sessions: [] as {
      location: { directory: string };
      title?: string;
      model?: SessionModel;
      agent?: string;
    }[],
    prompts: [] as RecordedCall[],
    waits: [] as RecordedCall[],
    contexts: [] as RecordedCall[],
    closed: 0,
  };
  const loader: SdkLoader = async () => ({
    OpenCode: {
      async create(options?: unknown) {
        calls.createOptions.push(options);
        return {
          sessions: {
            create: (input: {
              location: { directory: string };
              title?: string;
              model?: SessionModel;
              agent?: string;
            }) => {
              calls.sessions.push(input);
              return Promise.resolve({ id: 'session-1' });
            },
            prompt: (
              input: { sessionID: string; text: string },
              requestOptions?: { signal?: AbortSignal },
            ) => {
              calls.prompts.push({ ...input, signal: requestOptions?.signal });
              return Promise.resolve(undefined);
            },
            wait: (input: { sessionID: string }, requestOptions?: { signal?: AbortSignal }) => {
              calls.waits.push({ ...input, signal: requestOptions?.signal });
              return Promise.resolve(undefined);
            },
            context: (input: { sessionID: string }, requestOptions?: { signal?: AbortSignal }) => {
              calls.contexts.push({ ...input, signal: requestOptions?.signal });
              return Promise.resolve(transcripts.shift() ?? []);
            },
          },
          close: () => {
            calls.closed += 1;
            return Promise.resolve();
          },
        };
      },
    },
  });
  return { loader, calls };
}

describe('parseModelRef', () => {
  it('parses provider/model and provider/model#variant', () => {
    expect(parseModelRef('greenpt/deepseek-v4.1-flash')).toEqual({
      providerID: 'greenpt',
      id: 'deepseek-v4.1-flash',
    });
    expect(parseModelRef('anthropic/claude#fast')).toEqual({
      providerID: 'anthropic',
      id: 'claude',
      variant: 'fast',
    });
  });

  it('rejects a spec without a usable provider or model', () => {
    expect(parseModelRef('nomodel')).toBeUndefined();
    expect(parseModelRef('/model')).toBeUndefined();
    expect(parseModelRef('provider/')).toBeUndefined();
    expect(parseModelRef('provider/model#')).toBeUndefined();
  });
});

describe('assertTurnSucceeded', () => {
  it('passes a clean assistant turn', () => {
    expect(() =>
      assertTurnSucceeded([
        { type: 'assistant', finish: 'stop', content: [{ type: 'text', text: 'ok' }] },
      ]),
    ).not.toThrow();
  });

  it('throws with the provider message when the assistant errored', () => {
    expect(() =>
      assertTurnSucceeded([
        {
          type: 'assistant',
          finish: 'error',
          content: [],
          error: { message: 'free tier blocked' },
        },
      ]),
    ).toThrowError(/free tier blocked/);
  });

  it('throws when the session ended in failure', () => {
    expect(() =>
      assertTurnSucceeded([
        { type: 'idle', outcome: 'failed', error: { message: 'model unavailable' } },
      ]),
    ).toThrowError(/model unavailable/);
  });
});

describe('finalAssistantText', () => {
  it('joins the text parts of the last assistant message', () => {
    const text = finalAssistantText([
      { type: 'assistant', content: [{ type: 'text', text: 'older' }] },
      {
        type: 'assistant',
        content: [
          { type: 'reasoning', text: 'thinking' },
          { type: 'text', text: 'hello ' },
          { type: 'text', text: 'world' },
        ],
      },
    ]);
    expect(text).toBe('hello world');
  });

  it('ignores non-assistant messages and empty assistant text', () => {
    expect(
      finalAssistantText([
        { type: 'assistant', content: [{ type: 'text', text: 'first' }] },
        { type: 'user', content: [{ type: 'text', text: 'prompt' }] },
        { type: 'assistant', content: [{ type: 'reasoning', text: 'only thinking' }] },
      ]),
    ).toBe('first');
  });

  it('returns an empty string when there is no assistant text', () => {
    expect(finalAssistantText([])).toBe('');
  });
});

describe('createEmbeddedHostFactory', () => {
  it('points the host at the configured OpenCode database', async () => {
    const { loader, calls } = fakeSdk([[]]);
    await createEmbeddedHostFactory({ database: '/data/opencode.db' }, loader)();

    expect(calls.createOptions).toEqual([{ database: { path: '/data/opencode.db' } }]);
  });

  it('maps a turn to create, prompt, wait, and context with the session model', async () => {
    const { loader, calls } = fakeSdk([
      [
        { type: 'assistant', content: [{ type: 'text', text: 'turn one' }] },
        { type: 'assistant', finish: 'stop', content: [{ type: 'text', text: 'turn two' }] },
      ],
    ]);
    const host = await createEmbeddedHostFactory({}, loader)();

    const session = await host.createSession({
      directory: '/workspace',
      title: 'OpenSpec propose turn',
      model: { providerID: 'greenpt', id: 'deepseek-v4.1-flash' },
      agent: 'build',
    });
    const text = await host.runPrompt({ sessionID: session.id, text: 'do the thing' });

    expect(calls.sessions).toEqual([
      {
        location: { directory: '/workspace' },
        title: 'OpenSpec propose turn',
        model: { providerID: 'greenpt', id: 'deepseek-v4.1-flash' },
        agent: 'build',
      },
    ]);
    expect(calls.prompts).toMatchObject([{ sessionID: 'session-1', text: 'do the thing' }]);
    expect(calls.waits).toMatchObject([{ sessionID: 'session-1' }]);
    expect(calls.contexts).toMatchObject([{ sessionID: 'session-1' }]);
    expect(text).toBe('turn two');
  });

  it('fails the turn when the agent errored', async () => {
    const { loader } = fakeSdk([
      [{ type: 'assistant', finish: 'error', error: { message: 'boom' } }],
    ]);
    const host = await createEmbeddedHostFactory({}, loader)();
    await expect(host.runPrompt({ sessionID: 's', text: 'x' })).rejects.toThrowError(/boom/);
  });

  it('forwards the abort signal to prompt, wait, and context', async () => {
    const { loader, calls } = fakeSdk([[]]);
    const host = await createEmbeddedHostFactory({}, loader)();
    const controller = new AbortController();

    await host.runPrompt({ sessionID: 's', text: 'x', signal: controller.signal });

    expect(calls.prompts[0]?.signal).toBe(controller.signal);
    expect(calls.waits[0]?.signal).toBe(controller.signal);
    expect(calls.contexts[0]?.signal).toBe(controller.signal);
  });

  it('closes the underlying host', async () => {
    const { loader, calls } = fakeSdk([[]]);
    const host = await createEmbeddedHostFactory({}, loader)();

    await host.close();

    expect(calls.closed).toBe(1);
  });
});
