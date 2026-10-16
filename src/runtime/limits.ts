import type { TurnResult, TurnUsage } from '../domain/types.js';
import type { AgentRuntime, TurnRequest } from './types.js';

export type ExceededLimit = 'steps' | 'tokens' | 'duration';

export class LimitExceededError extends Error {
  readonly limit: ExceededLimit;

  constructor(limit: ExceededLimit) {
    super(`turn exceeded the ${limit} limit`);
    this.name = 'LimitExceededError';
    this.limit = limit;
  }
}

/**
 * Enforces per-turn budget: it aborts the turn signal when the step, token, or
 * wall-clock limit is exceeded.
 */
export class TurnLimiter {
  private readonly controller = new AbortController();
  private readonly timer: NodeJS.Timeout;
  private steps = 0;
  private tokens = 0;
  private exceeded: ExceededLimit | null = null;

  constructor(private readonly limits: TurnRequest['limits']) {
    this.timer = setTimeout(() => {
      this.abort('duration');
    }, limits.maxDurationMs);
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get exceededLimit(): ExceededLimit | null {
    return this.exceeded;
  }

  addUsage(usage: Partial<TurnUsage>): void {
    if (usage.steps !== undefined) this.steps += usage.steps;
    if (usage.tokens !== undefined) this.tokens += usage.tokens;
    if (this.steps > this.limits.maxSteps) this.abort('steps');
    if (this.tokens > this.limits.maxTokens) this.abort('tokens');
  }

  dispose(): void {
    clearTimeout(this.timer);
  }

  private abort(limit: ExceededLimit): void {
    if (this.exceeded !== null) return;
    this.exceeded = limit;
    this.controller.abort(new LimitExceededError(limit));
  }
}

/**
 * Wraps a runtime so every turn is bounded by its configured limits. When a
 * limit is hit the turn fails with {@link LimitExceededError}, regardless of
 * whether the inner runtime respected the abort signal.
 */
export class LimitedRuntime implements AgentRuntime {
  readonly id: string;

  constructor(private readonly inner: AgentRuntime) {
    this.id = `${inner.id}+limits`;
  }

  async run(request: TurnRequest): Promise<TurnResult> {
    const limiter = new TurnLimiter(request.limits);
    const signals = [limiter.signal];
    if (request.signal !== undefined) signals.push(request.signal);
    const signal = signals.length > 1 ? AbortSignal.any(signals) : limiter.signal;

    try {
      const result = await this.inner.run({
        ...request,
        signal,
        onUsage: (usage) => {
          limiter.addUsage(usage);
          request.onUsage?.(usage);
        },
      });
      if (limiter.exceededLimit !== null) throw new LimitExceededError(limiter.exceededLimit);
      return result;
    } catch (error) {
      if (limiter.exceededLimit !== null) throw new LimitExceededError(limiter.exceededLimit);
      throw error;
    } finally {
      limiter.dispose();
    }
  }
}
