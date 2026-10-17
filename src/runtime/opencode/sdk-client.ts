import type { TurnUsage } from '../../domain/types.js';
import type { OpenCodeClient, OpenCodeSkillRequest, OpenCodeSkillResult } from './client.js';

/** A provider/model reference for a session. */
export interface SessionModel {
  providerID: string;
  id: string;
  variant?: string;
}

/** What a completed prompt produced: the agent's final text and its usage. */
export interface OpenCodePromptResult {
  text: string;
  usage?: TurnUsage;
}

/**
 * A running embedded OpenCode host, reduced to the operations a turn needs.
 * Declared structurally so the adapter stays independent of the SDK's generated
 * types and so turns can be tested against a fake.
 */
export interface OpenCodeHost {
  /** Create a fresh session rooted at a workspace directory. */
  createSession(input: {
    directory: string;
    title: string;
    model?: SessionModel;
    agent?: string;
  }): Promise<{ id: string }>;
  /**
   * Send one prompt and resolve with the agent's final text and usage once the
   * session is idle again. Reports the usage through `onUsage` before it
   * asserts success, so a turn that then fails still reports what it consumed.
   * Rejects when the turn failed or when `signal` aborts.
   */
  runPrompt(input: {
    sessionID: string;
    text: string;
    signal?: AbortSignal;
    onUsage?: (usage: Partial<TurnUsage>) => void;
  }): Promise<OpenCodePromptResult>;
  /** Release the host and its resources. */
  close(): Promise<void>;
}

/** Creates the single embedded host a client reuses. Called at most once. */
export type OpenCodeHostFactory = () => Promise<OpenCodeHost>;

export interface EmbeddedOpenCodeClientOptions {
  /** Model every session runs on; the host's default when omitted. */
  model?: SessionModel;
  /** OpenCode agent every session runs; the host's default when omitted. */
  agent?: string;
}

/**
 * Runs OpenSpec skills through an embedded, in-process OpenCode host.
 *
 * The host is created lazily on the first turn and reused for the life of the
 * client; `dispose` closes it. Each turn gets a fresh session rooted at the turn
 * workspace, so no state leaks between turns beyond the repository and the
 * review transcript.
 *
 * The agent's final text is reported as the turn summary, and the model and
 * token usage the session recorded as the turn's usage. Fields the agent does
 * not emit machine-readably (`commits`, `questions`, `needsInput`,
 * `agentClaimsReady`) are left empty: readiness is decided by the objective
 * OpenSpec predicate, never by the adapter's reading of prose.
 */
export class EmbeddedOpenCodeClient implements OpenCodeClient {
  private hostPromise: Promise<OpenCodeHost> | undefined;

  constructor(
    private readonly createHost: OpenCodeHostFactory,
    private readonly options: EmbeddedOpenCodeClientOptions = {},
  ) {}

  private host(): Promise<OpenCodeHost> {
    this.hostPromise ??= this.createHost();
    return this.hostPromise;
  }

  async runSkill(request: OpenCodeSkillRequest): Promise<OpenCodeSkillResult> {
    const host = await this.host();
    const session = await host.createSession({
      directory: request.workspace,
      title: `OpenSpec ${request.skill} turn`,
      ...(this.options.model === undefined ? {} : { model: this.options.model }),
      ...(this.options.agent === undefined ? {} : { agent: this.options.agent }),
    });
    const { text, usage } = await host.runPrompt({
      sessionID: session.id,
      text: request.prompt,
      signal: request.signal,
      ...(request.onUsage === undefined ? {} : { onUsage: request.onUsage }),
    });
    return {
      commits: [],
      summary: text.trim(),
      questions: [],
      needsInput: false,
      agentClaimsReady: false,
      ...(usage === undefined ? {} : { usage }),
    };
  }

  /** Close the embedded host, if one was created. Safe to call more than once. */
  async dispose(): Promise<void> {
    const pending = this.hostPromise;
    this.hostPromise = undefined;
    if (pending === undefined) return;
    const host = await pending;
    await host.close();
  }
}
