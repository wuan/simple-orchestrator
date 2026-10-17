# Design

## Context

See `proposal.md` — Why. The pieces this design builds on:

- A turn returns a `TurnResult` carrying an optional `usage: TurnUsage`
  (`src/domain/types.ts`). `TurnUsage` already has `steps`, `tokens`, and
  `durationMs`, but the OpenCode adapter never populates it, and `durationMs`
  is unused everywhere.
- `src/orchestrator/engine.ts` posts one comment per turn in `postTurn`, plus a
  readiness prompt after a ready propose turn and a failure comment from
  `signalFailure`. None of them mention cost.
- `src/runtime/opencode/sdk-host.ts` reads the session's messages in
  `runPrompt` to extract the final assistant text. Each assistant message in
  that context carries a `model` and `tokens` (input, output, reasoning, cache
  read/write), and the schema ships `TokenUsage.total(...)` that sums all five
  buckets. The host currently discards both.
- `src/runtime/limits.ts` already streams partial usage from a runtime through
  `TurnRequest.onUsage`.

## Goals / Non-Goals

**Goals:**

- Every comment that reports a turn's outcome shows the model, the token total,
  and the elapsed time for that turn.
- The metrics are correct for the shipped OpenCode runtime and degrade
  gracefully for a runtime that reports nothing.
- Elapsed time is reported even though no runtime currently measures it.

**Non-Goals:**

- Cost in currency, per-model breakdowns, or token subtotals (cache hit rate,
  reasoning split). The comment shows one token total.
- Persisting usage anywhere other than the comment and the logs; there is still
  no database.
- Metrics on transition comments that have no turn behind them (completion,
  cancellation).
- A per-turn model override or a model matrix.

## Decisions

### Decision: usage comes from the session, not from prose

`createEmbeddedHostFactory().runPrompt` reads the assistant messages it already
fetches and derives `{ model, tokens }` from them: the model is the last
assistant message's `model` (`providerID/id`, plus `#variant` when present), and
the token total sums `TokenUsage.total` across the turn's assistant messages
(input + output + reasoning + cache read + cache write), matching the platform's
own convention. The host reports this through `onUsage` and returns it alongside
the final text.

Alternatives considered: trusting the agent's prose (rejected: unreliable and
inconsistent with how readiness is decided); reading the configured
`agent.model` (rejected: it does not reflect a session that switched models, and
the adapter already has the real value).

### Decision: the orchestrator measures elapsed time

The engine records `Date.now()` around the runtime call in `runTurn`, including
the single retry, and reports that as `durationMs`. The runtime's own
`durationMs` is not trusted; adapters do not have to measure time, and this
works for every runtime. This also means elapsed time is known on the failure
path, where no result is returned.

Alternatives considered: deriving duration from message timestamps (rejected:
not every runtime exposes them, and it excludes queueing/retry time the operator
cares about).

### Decision: one metrics header, rendered once

The engine builds a single `TurnUsage` for the comment by combining the runtime's
reported `model`, `steps`, and `tokens` with its measured `durationMs`, then
renders one line: ``Model: `<ref>` · Tokens: <n> · Elapsed: <t>``. Unknown model
or tokens render as `unknown`; elapsed is always present for a turn. The same
helper is used for the turn comment, the readiness prompt, and the failure
comment, so the three cannot drift.

Alternatives considered: separate fields per comment type (rejected:
duplication); a table (rejected: the comment is already short-form and a line
reads better in email and mobile clients).

### Decision: partial usage survives a failed turn

`runTurn` passes an accumulator to `runtime.run` via `onUsage`. The OpenCode
host invokes `onUsage` after reading the session and before it asserts success,
so a turn that then fails still contributes the tokens and model it consumed.
The failure comment reports elapsed time plus that partial usage.

Alternatives considered: reporting nothing on failure (rejected: the costly
turns are often the ones that fail); attaching usage to a typed error (rejected:
`onUsage` already exists and needs no new error surface).

### Decision: extend the existing usage shape, not a parallel one

`TurnUsage` gains a `model: string` field and keeps `steps`, `tokens`, and
`durationMs`. The runtime reports partial usage as before; the engine fills in
`durationMs` when it renders. This keeps one usage vocabulary across the
runtime interface, the limiter, and the comment.

Alternatives considered: a separate `TurnMetrics` type (rejected: two nearly
identical shapes to keep in sync for no benefit).

## Risks / Trade-offs

- [A runtime reports usage only at the end, so a failure mid-turn under-reports
  tokens] -> acceptable: the comment states what was known, and the elapsed
  time is always exact.
- [Token totals differ from a provider's dashboard if cache accounting
  differs] -> the total follows `TokenUsage.total`, the same convention the
  platform uses, and the design documents it.
- [A longer comment adds noise to every turn] -> the metrics are one compact
  line, and the issue explicitly asks for them on every turn.
- [The model line can be long for a variant] -> it is the same
  `provider/model#variant` form operators already configure, wrapped in code
  formatting.

## Migration Plan

No data or configuration migration. Existing deployments pick up the new
comment line after upgrading. Rollback is a revert; the comments already posted
are immutable history but harmless.
