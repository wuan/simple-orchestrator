import type { TurnResult } from '../../domain/types.js';
import type { AgentRuntime, TurnRequest } from '../types.js';

/** An `AgentRuntime` for tests: queue results, record requests. */
export class FakeRuntime implements AgentRuntime {
  readonly id = 'fake';
  readonly requests: TurnRequest[] = [];

  private readonly queue: TurnResult[] = [];
  private readonly factory: ((request: TurnRequest) => TurnResult) | undefined;

  constructor(factory?: (request: TurnRequest) => TurnResult) {
    this.factory = factory;
  }

  enqueue(result: TurnResult): void {
    this.queue.push(result);
  }

  async run(request: TurnRequest): Promise<TurnResult> {
    this.requests.push(request);
    const queued = this.queue.shift();
    const result = queued ?? this.factory?.(request);
    if (result === undefined) {
      throw new Error('FakeRuntime: no result queued and no factory configured');
    }
    request.onUsage?.(
      result.usage ?? {
        model: 'fake/model',
        input: 10,
        output: 5,
        reasoning: 2,
        cacheRead: 2,
        cacheWrite: 1,
        tokens: 20,
        steps: 1,
      },
    );
    return result;
  }
}
