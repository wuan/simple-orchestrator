import { describe, expect, it } from 'vitest';

import { createEmbeddedHostFactory, finalAssistantText, type SdkLoader } from './sdk-host.js';

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
}
type Transcript = ReadonlyArray<FakeMessage>;

function fakeSdk(replies: Transcript[]) {
  const calls = {
    createOptions: [] as unknown[],
    sessions: [] as { directory: string; title?: string }[],
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
            create: (input: { location: { directory: string }; title?: string }) => {
              calls.sessions.push({ directory: input.location.directory, title: input.title });
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
              return Promise.resolve(replies.shift() ?? []);
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
  it('maps a turn to create, prompt, wait, and context', async () => {
    const { loader, calls } = fakeSdk([
      [
        { type: 'assistant', content: [{ type: 'text', text: 'turn one' }] },
        { type: 'assistant', content: [{ type: 'text', text: 'turn two' }] },
      ],
    ]);
    const host = await createEmbeddedHostFactory({ create: { default_agent: 'build' } }, loader)();

    const session = await host.createSession({
      directory: '/workspace',
      title: 'OpenSpec propose turn',
    });
    const text = await host.runPrompt({ sessionID: session.id, text: 'do the thing' });

    expect(calls.createOptions).toEqual([{ default_agent: 'build' }]);
    expect(calls.sessions).toEqual([{ directory: '/workspace', title: 'OpenSpec propose turn' }]);
    expect(calls.prompts).toMatchObject([{ sessionID: 'session-1', text: 'do the thing' }]);
    expect(calls.waits).toMatchObject([{ sessionID: 'session-1' }]);
    expect(calls.contexts).toMatchObject([{ sessionID: 'session-1' }]);
    expect(text).toBe('turn two');
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
