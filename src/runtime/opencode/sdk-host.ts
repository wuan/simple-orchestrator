import type { OpenCodeHost, OpenCodeHostFactory, SessionModel } from './sdk-client.js';

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
  finish?: string;
  outcome?: string;
  error?: { message?: string };
}
interface SdkSessions {
  create(input: {
    location: { directory: string };
    title?: string;
    model?: SessionModel;
    agent?: string;
  }): Promise<{ id: string }>;
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
  /**
   * Path to the OpenCode database holding provider auth and model definitions.
   * The embedded SDK uses an in-memory database by default, which has neither,
   * so point this at the operator's OpenCode data database to reuse its auth.
   */
  database?: string;
}

/** Parse `provider/model` or `provider/model#variant` into a session model ref. */
export function parseModelRef(spec: string): SessionModel | undefined {
  const slash = spec.indexOf('/');
  if (slash <= 0 || slash === spec.length - 1) return undefined;
  const providerID = spec.slice(0, slash);
  const rest = spec.slice(slash + 1);
  const hash = rest.indexOf('#');
  if (hash < 0) return { providerID, id: rest };
  const id = rest.slice(0, hash);
  const variant = rest.slice(hash + 1);
  if (id === '' || variant === '') return undefined;
  return { providerID, id, variant };
}

/**
 * Throw when the agent's turn failed. The SDK reports a provider/auth error on
 * the assistant message (`finish: "error"`) and a failed session as an `idle`
 * message, but does not reject the prompt; without this the orchestrator would
 * treat a failed turn as a success and advance the workflow with no work.
 */
export function assertTurnSucceeded(messages: ReadonlyArray<SdkMessage>): void {
  for (const message of messages) {
    if (
      message.type === 'assistant' &&
      (message.finish === 'error' || message.error !== undefined)
    ) {
      throw new Error(
        `OpenCode turn failed: ${message.error?.message ?? 'the model returned an error'}`,
      );
    }
    if (message.type === 'idle' && message.outcome === 'failed') {
      throw new Error(
        `OpenCode turn failed: ${message.error?.message ?? 'the session ended in failure'}`,
      );
    }
  }
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
 * fails the turn when the agent errored, then reads back the final text.
 */
export function createEmbeddedHostFactory(
  options: EmbedOpenCodeOptions = {},
  load: SdkLoader = defaultLoader,
): OpenCodeHostFactory {
  return async (): Promise<OpenCodeHost> => {
    const sdk = await load();
    const host = await sdk.OpenCode.create(
      options.database === undefined ? undefined : { database: { path: options.database } },
    );
    return {
      createSession: ({ directory, title, model, agent }) =>
        host.sessions.create({
          location: { directory },
          title,
          ...(model === undefined ? {} : { model }),
          ...(agent === undefined ? {} : { agent }),
        }),
      async runPrompt({ sessionID, text, signal }) {
        const request = signal === undefined ? undefined : { signal };
        await host.sessions.prompt({ sessionID, text }, request);
        await host.sessions.wait({ sessionID }, request);
        const messages = await host.sessions.context({ sessionID }, request);
        assertTurnSucceeded(messages);
        return finalAssistantText(messages);
      },
      close: () => host.close(),
    };
  };
}
