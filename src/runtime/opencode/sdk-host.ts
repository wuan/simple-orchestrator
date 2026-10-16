import type { OpenCodeHost, OpenCodeHostFactory } from './sdk-client.js';

/**
 * The slice of the embedded SDK this adapter uses. Declared structurally rather
 * than imported from `@opencode/sdk` so the orchestrator's build does not depend
 * on the SDK's large generated type surface, and so the mapping can be tested
 * against a fake module. The shape is exercised by loading the real host under
 * Node 24.
 */
interface SdkContentPart {
  type?: string;
  text?: string;
}
interface SdkMessage {
  type?: string;
  content?: ReadonlyArray<SdkContentPart>;
}
interface SdkSessions {
  create(input: { location: { directory: string }; title?: string }): Promise<{ id: string }>;
  prompt(
    input: { sessionID: string; text: string },
    options?: { signal?: AbortSignal },
  ): Promise<unknown>;
  wait(input: { sessionID: string }, options?: { signal?: AbortSignal }): Promise<unknown>;
  context(
    input: { sessionID: string },
    options?: { signal?: AbortSignal },
  ): Promise<ReadonlyArray<SdkMessage>>;
}
interface SdkHost {
  sessions: SdkSessions;
  close(): Promise<void>;
}
interface SdkModule {
  OpenCode: { create(options?: unknown): Promise<SdkHost> };
}

/** Loads the SDK module; injectable so the mapping is testable without it. */
export type SdkLoader = () => Promise<SdkModule>;

const defaultLoader: SdkLoader = async () =>
  (await import('@opencode/sdk')) as unknown as SdkModule;

export interface EmbedOpenCodeOptions {
  /** Passed through to `OpenCode.create` (model, agents, plugins, logging, ...). */
  create?: unknown;
}

/** The text of the last assistant message, ignoring reasoning and tool parts. */
export function finalAssistantText(messages: ReadonlyArray<SdkMessage>): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.type !== 'assistant') continue;
    const text = (message.content ?? [])
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
    if (text.trim() !== '') return text;
  }
  return '';
}

/**
 * Build a host factory backed by the embedded `@opencode/sdk`.
 *
 * The SDK is imported lazily, on the first turn, so the orchestrator's other
 * commands never pay to load it, and the returned host is created once and
 * reused. `runPrompt` sends the prompt, waits for the session to become idle,
 * then reads back the final assistant text.
 */
export function createEmbeddedHostFactory(
  options: EmbedOpenCodeOptions = {},
  load: SdkLoader = defaultLoader,
): OpenCodeHostFactory {
  return async (): Promise<OpenCodeHost> => {
    const sdk = await load();
    const host = await sdk.OpenCode.create(options.create);
    return {
      createSession: ({ directory, title }) =>
        host.sessions.create({ location: { directory }, title }),
      async runPrompt({ sessionID, text, signal }) {
        const request = signal === undefined ? undefined : { signal };
        await host.sessions.prompt({ sessionID, text }, request);
        await host.sessions.wait({ sessionID }, request);
        const messages = await host.sessions.context({ sessionID }, request);
        return finalAssistantText(messages);
      },
      close: () => host.close(),
    };
  };
}
