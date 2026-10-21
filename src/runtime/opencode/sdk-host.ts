import type { TurnUsage } from '../../domain/types.js';
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
/** The model reference an assistant message carries. */
interface SdkModelRef {
  providerID?: string;
  id?: string;
  variant?: string;
}
/** The per-kind token counts an assistant message carries, when the provider reports them. */
interface SdkTokens {
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: { read?: number; write?: number };
}
interface SdkMessage {
  type?: string;
  content?: ReadonlyArray<SdkContentPart>;
  model?: SdkModelRef;
  tokens?: SdkTokens;
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
  /** Provider id whose endpoint and credential variable the overlay targets. */
  provider?: string;
  /** API base URL for the provider; the provider's registry default when omitted. */
  apiEndpoint?: string;
  /** Environment variable the provider reads its API key from. */
  apiKeyEnv?: string;
}

/** The endpoint and credential-variable values a provider overlay carries. */
export interface ProviderOverlay {
  apiEndpoint?: string;
  apiKeyEnv?: string;
}

/**
 * Build the OpenCode provider-override document for one provider, as the JSON
 * the SDK's inline config carries. `options.baseURL` sets the endpoint and
 * `env` names the credential variable, so a registry entry that hardcodes
 * different values is overridden without editing the registry. Returns
 * `undefined` when neither value is set, leaving the provider's own defaults.
 */
export function providerConfig(
  provider: string,
  overlay: ProviderOverlay = {},
): string | undefined {
  const entry: { options?: { baseURL: string }; env?: string[] } = {};
  if (overlay.apiEndpoint !== undefined) entry.options = { baseURL: overlay.apiEndpoint };
  if (overlay.apiKeyEnv !== undefined) entry.env = [overlay.apiKeyEnv];
  if (entry.options === undefined && entry.env === undefined) return undefined;
  return JSON.stringify({ provider: { [provider]: entry } });
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

/** Format a session model as the operator-facing `provider/id#variant` reference. */
export function formatModelRef(model: SessionModel): string {
  const base = `${model.providerID}/${model.id}`;
  return model.variant === undefined || model.variant === '' ? base : `${base}#${model.variant}`;
}

/**
 * Derive a turn's usage from the assistant messages it produced: the model is
 * the last assistant message's, and each token bucket is summed across the
 * turn's assistant messages with their total following the platform's
 * `TokenUsage.total` convention. Returns `undefined` when the turn produced no
 * assistant message (nothing could be read).
 */
export function extractUsage(messages: ReadonlyArray<SdkMessage>): TurnUsage | undefined {
  let model: string | undefined;
  let input = 0;
  let output = 0;
  let reasoning = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let sawAssistant = false;
  let sawTokens = false;
  for (const message of messages) {
    if (message.type !== 'assistant') continue;
    sawAssistant = true;
    const ref = message.model;
    if (ref?.providerID !== undefined && ref.id !== undefined) {
      model =
        ref.variant === undefined || ref.variant === ''
          ? `${ref.providerID}/${ref.id}`
          : `${ref.providerID}/${ref.id}#${ref.variant}`;
    }
    const tokens = message.tokens;
    if (tokens !== undefined) {
      sawTokens = true;
      input += tokens.input ?? 0;
      output += tokens.output ?? 0;
      reasoning += tokens.reasoning ?? 0;
      cacheRead += tokens.cache?.read ?? 0;
      cacheWrite += tokens.cache?.write ?? 0;
    }
  }
  if (!sawAssistant) return undefined;
  const usage: TurnUsage = {};
  if (model !== undefined) usage.model = model;
  if (sawTokens) {
    usage.input = input;
    usage.output = output;
    usage.reasoning = reasoning;
    usage.cacheRead = cacheRead;
    usage.cacheWrite = cacheWrite;
    usage.tokens = input + output + reasoning + cacheRead + cacheWrite;
  }
  return usage;
}

/**
 * Build a host factory backed by the embedded `@opencode/sdk`.
 *
 * The SDK is imported lazily, on the first turn, so the orchestrator's other
 * commands never pay to load it, and the returned host is created once and
 * reused. `runPrompt` sends the prompt, waits for the session to become idle,
 * reads back the final text and the usage, reports the usage, then fails the
 * turn when the agent errored.
 */
export function createEmbeddedHostFactory(
  options: EmbedOpenCodeOptions = {},
  load: SdkLoader = defaultLoader,
): OpenCodeHostFactory {
  return async (): Promise<OpenCodeHost> => {
    const sdk = await load();
    const content =
      options.provider === undefined
        ? undefined
        : providerConfig(options.provider, {
            ...(options.apiEndpoint === undefined ? {} : { apiEndpoint: options.apiEndpoint }),
            ...(options.apiKeyEnv === undefined ? {} : { apiKeyEnv: options.apiKeyEnv }),
          });
    const createOptions: { database?: { path: string }; config?: { content: string } } = {};
    if (options.database !== undefined) createOptions.database = { path: options.database };
    if (content !== undefined) createOptions.config = { content };
    const host = await sdk.OpenCode.create(
      createOptions.database === undefined && createOptions.config === undefined
        ? undefined
        : createOptions,
    );
    return {
      createSession: ({ directory, title, model, agent }) =>
        host.sessions.create({
          location: { directory },
          title,
          ...(model === undefined ? {} : { model }),
          ...(agent === undefined ? {} : { agent }),
        }),
      async runPrompt({ sessionID, text, signal, onUsage }) {
        const request = signal === undefined ? undefined : { signal };
        await host.sessions.prompt({ sessionID, text }, request);
        await host.sessions.wait({ sessionID }, request);
        const messages = await host.sessions.context({ sessionID }, request);
        const usage = extractUsage(messages);
        // Report what the turn consumed before asserting success, so a turn
        // that then fails still contributes its model and tokens.
        if (usage !== undefined) onUsage?.(usage);
        assertTurnSucceeded(messages);
        return { text: finalAssistantText(messages), ...(usage === undefined ? {} : { usage }) };
      },
      close: () => host.close(),
    };
  };
}
