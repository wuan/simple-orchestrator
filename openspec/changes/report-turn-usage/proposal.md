# Proposal

## Why

The orchestrator posts a comment on the pull request after every turn, but the
comment describes only what the turn produced. It says nothing about what the
turn cost: which model ran it, how many tokens it consumed (and in which
buckets), how long it took, or whether it had to be retried. An operator
watching a pull request therefore cannot see the cost or latency of an action,
and a slow, expensive, or flaky model only shows up later in the logs, if at
all.

## What Changes

- **Turn usage is reported by the runtime.** A turn's structured result carries
  the model that ran it and the tokens it consumed broken down by kind - input,
  output, reasoning, and cache read and write - alongside their total. The
  OpenCode adapter reads these from the turn's own session messages rather than
  inferring them from agent prose.
- **Elapsed time and attempts are measured by the orchestrator.** The engine
  times each turn's runtime call itself, including every retry, and counts how
  many attempts the turn took, so elapsed time and retry information are
  reported for every runtime, including one that does not self-report a
  duration.
- **Every PR comment carries a metrics line.** Every comment the orchestrator
  posts - the propose/apply turn comments, the readiness prompt that follows a
  ready propose turn, a turn-failure comment, and lifecycle comments such as
  workflow completion and cancellation - states the model, the per-kind token
  counts with their total, the elapsed time, and the attempt count for the turn
  behind it. A comment with no turn behind it repeats the most recent turn's
  metrics, labelled as the last turn's. Values the runtime did not report
  degrade to an explicit "unknown" rather than being fabricated.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-runtime`: a turn's structured result reports the model used and the
  tokens consumed by kind with their total, read from the OpenCode session.
- `workflow-orchestration`: the orchestrator measures each turn's elapsed time
  and attempts and includes the model, token counts, elapsed time, and attempts
  in every comment it posts, repeating the last turn's metrics on comments that
  have no turn behind them.

## Impact

- **Code**: `src/domain/types.ts` (turn usage shape: model and token counts by
  kind), `src/runtime/opencode/` (extract the model and each token bucket from
  the session), `src/orchestrator/engine.ts` (measure elapsed time and attempts,
  render the metrics on every comment, and recover the most recent turn's
  metrics for lifecycle comments), and the runtime/engine tests and fakes that
  construct turn results.
- **Operational**: pull request comments grow by one compact metrics line; no
  new configuration and no new dependency.
- **Dependencies**: none new.
