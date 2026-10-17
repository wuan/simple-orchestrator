# Proposal

## Why

The orchestrator posts a comment on the pull request after every turn, but the
comment describes only what the turn produced. It says nothing about what the
turn cost: which model ran it, how many tokens it consumed, or how long it took.
An operator watching a pull request therefore cannot see the cost or latency of
an action, and a slow or expensive model only shows up later in the logs, if at
all.

## What Changes

- **Turn usage is reported by the runtime.** A turn's structured result carries
  the model that ran it and the total number of tokens it consumed, in addition
  to the existing step count. The OpenCode adapter reads these from the turn's
  own session messages (model and token usage) rather than inferring them from
  agent prose.
- **Elapsed time is measured by the orchestrator.** The engine times each turn's
  runtime call itself, so elapsed time is reported for every runtime, including
  one that does not self-report a duration.
- **Turn comments carry a metrics line.** Every comment the orchestrator posts
  to report a turn's outcome — the propose/apply turn comment, the readiness
  prompt that follows a ready propose turn, and a turn-failure comment — states
  the model, the token total, and the elapsed time. Values the runtime did not
  report degrade to an explicit "unknown" rather than being fabricated.
- **Lifecycle-only comments are unchanged.** Comments posted with no turn behind
  them (workflow complete, cancellation) carry no model or token metrics,
  because no turn ran to measure.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-runtime`: a turn's structured result reports the model used and the
  total tokens consumed, read from the OpenCode session.
- `workflow-orchestration`: the orchestrator measures each turn's elapsed time
  and includes the model, token total, and elapsed time in the comments it posts
  for a turn.

## Impact

- **Code**: `src/domain/types.ts` (turn usage shape), `src/runtime/opencode/`
  (extract model and tokens from the session), `src/orchestrator/engine.ts`
  (measure elapsed time and render the metrics on turn comments), and the
  runtime/engine tests and fakes that construct turn results.
- **Operational**: pull request comments grow by one compact metrics line; no
  new configuration and no new dependency.
- **Dependencies**: none new.
