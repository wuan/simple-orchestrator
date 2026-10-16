import type { OpenCodeClient, OpenCodeSkillRequest, OpenCodeSkillResult } from './client.js';

/**
 * A running embedded OpenCode host, reduced to the operations a turn needs.
 * Declared structurally so the adapter stays independent of the SDK's generated
 * types and so turns can be tested against a fake.
 */
export interface OpenCodeHost {
  /** Create a fresh session rooted at a workspace directory. */
  createSession(input: { directory: string; title: string }): Promise<{ id: string }>;
  /**
   * Send one prompt and resolve with the agent's final text once the session is
   * idle again. Rejects when `signal` aborts.
   */
  runPrompt(input: { sessionID: string; text: string; signal?: AbortSignal }): Promise<string>;
  /** Release the host and its resources. */
  close(): Promise<void>;
}

/** Creates the single embedded host a client reuses. Called at most once. */
export type OpenCodeHostFactory = () => Promise<OpenCodeHost>;

/**
 * Runs OpenSpec skills through an embedded, in-process OpenCode host.
 *
 * The host is created lazily on the first turn and reused for the life of the
 * client; `dispose` closes it. Each turn gets a fresh session rooted at the turn
 * workspace, so no state leaks between turns beyond the repository and the
 * review transcript.
 *
 * The agent's final text is reported as the turn summary. Fields the agent does
 * not emit machine-readably (`commits`, `questions`, `needsInput`,
 * `agentClaimsReady`) are left empty: readiness is decided by the objective
 * OpenSpec predicate, never by the adapter's reading of prose.
 */
export class EmbeddedOpenCodeClient implements OpenCodeClient {
  private hostPromise: Promise<OpenCodeHost> | undefined;

  constructor(private readonly createHost: OpenCodeHostFactory) {}

  private host(): Promise<OpenCodeHost> {
    this.hostPromise ??= this.createHost();
    return this.hostPromise;
  }

  async runSkill(request: OpenCodeSkillRequest): Promise<OpenCodeSkillResult> {
    const host = await this.host();
    const session = await host.createSession({
      directory: request.workspace,
      title: `OpenSpec ${request.skill} turn`,
    });
    const summary = await host.runPrompt({
      sessionID: session.id,
      text: request.prompt,
      signal: request.signal,
    });
    return {
      commits: [],
      summary: summary.trim(),
      questions: [],
      needsInput: false,
      agentClaimsReady: false,
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
