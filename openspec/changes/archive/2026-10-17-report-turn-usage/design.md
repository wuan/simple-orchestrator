# Design

## Context

See `proposal.md` - Why. The pieces this design builds on:

- A turn returns a `TurnResult` carrying an optional `usage: TurnUsage`
  (`src/domain/types.ts`). `TurnUsage` already has `steps`, `tokens`, and
  `durationMs`, but the OpenCode adapter never populates it, and `durationMs`
  is unused everywhere.
- `src/orchestrator/engine.ts` posts one comment per turn in `postTurn`, plus a
  readiness prompt after a ready propose turn and a failure comment from
  `signalFailure`. Lifecycle transitions in `perform` (`finish`, `cancel`, and a
  revise-limit `fail`) post a comment with no turn behind them. None of them
  mention cost.
- `src/runtime/opencode/sdk-host.ts` reads the session's messages in
  `runPrompt` to extract the final assistant text. Each assistant message in
  that context carries a `model` and `tokens` (input, output, reasoning, cache
  read and write), and the schema ships `TokenUsage.total(...)` that sums all
  five buckets. The host currently discards both.
- `src/runtime/limits.ts` already streams partial usage from a runtime through
  `TurnRequest.onUsage`.
- The engine is stateless: every poll re-reads provider comments, and state
  lives only in labels and comment history.

## Goals / Non-Goals

**Goals:**

- Every comment the orchestrator posts shows the model, the tokens consumed by
  kind and in total, the elapsed time, and the number of attempts for the turn
  behind it.
- The metrics are correct for the shipped OpenCode runtime and degrade
  gracefully for a runtime that reports nothing.
- Elapsed time and the attempt count are reported even though no runtime
  measures them.
- Lifecycle comments with no turn behind them repeat the most recent turn's
  metrics without the engine holding state, so a restart still reports them.

**Non-Goals:**

- Cost in currency, per-model breakdowns across turns, or cache hit rate as a
  ratio. The comment shows token counts by kind and one total.
- Persisting usage anywhere other than the comment and the logs; there is still
  no database.
- Changing what a turn does; this change only reports.

## Decisions

### Decision: usage comes from the session, not from prose

`createEmbeddedHostFactory().runPrompt` reads the assistant messages it already
fetches and derives the model and every token bucket from them: the model is the
last assistant message's `model` (`providerID/id`, plus `#variant` when
present), and each token count is summed across the turn's assistant messages
(input, output, reasoning, cache read, cache write) with their total following
the platform's `TokenUsage.total` convention. The host reports this through
`onUsage` and returns it alongside the final text.

Alternatives considered: trusting the agent's prose (rejected: unreliable and
inconsistent with how readiness is decided); reading the configured
`agent.model` (rejected: it does not reflect a session that switched models, and
the adapter already has the real value).

### Decision: the orchestrator measures elapsed time and attempts

The engine records `Date.now()` around the runtime call in `runTurn`, including
the single retry, and counts the attempts `withRetry` made. Elapsed time is the
wall clock spent across every attempt, and the attempt count is reported
alongside it, so a retried turn is visible. The runtime's own `durationMs` is
not trusted; adapters do not have to measure time, and this works for every
runtime. It also means elapsed time and attempts are known on the failure path,
where no result is returned.

Alternatives considered: deriving duration from message timestamps (rejected:
not every runtime exposes them, and it excludes queueing and retry time the
operator cares about); leaving retries implicit in the elapsed time (rejected:
the reviewer asked for retry information explicitly).

### Decision: one metrics header, rendered once

The engine builds a single `TurnUsage` for the comment by combining the runtime's
reported `model` and token counts with its measured `durationMs` and `attempts`,
then renders one line:

`**Usage:** model <ref> · tokens <total> (input <n> · output <n> · reasoning <n> · cache read <n> · cache write <n>) · elapsed <t> · attempts <n>`

`<ref>` is code-formatted; unknown model or tokens render as `unknown`; elapsed
and attempts are always present for a turn. The same helper is used for the turn
comment, the readiness prompt, and the failure comment, so they cannot drift.

Alternatives considered: separate fields per comment type (rejected:
duplication); a table (rejected: a line reads better in email and mobile
clients); showing only the token total (rejected: the reviewer asked for the
individual counts as well).

### Decision: lifecycle comments repeat the last turn's metrics

A lifecycle comment (workflow completion, cancellation, or a transition failure
such as the revise limit) has no turn behind it, so the engine repeats the most
recent turn's metrics and labels the line as the last turn's. To keep the engine
stateless and restart-safe, every turn comment (and the readiness and failure
comments) embeds a machine-readable marker - an HTML comment carrying the usage
as JSON - that is invisible in the rendered comment. When the engine posts a
lifecycle comment it reads the newest marker from the comments it already
fetched for the poll and re-renders those metrics. If no marker exists yet (a
lifecycle comment before any turn ran), the metrics are stated as unknown.

Alternatives considered: holding the last usage in process state (rejected: it
breaks the restart-idempotent, stateless design - a restart would lose the
metrics); parsing the human-visible line (rejected: fragile against later prose
edits, whereas the marker is a deliberate contract).

### Decision: partial usage survives a failed turn

`runTurn` passes an accumulator to `runtime.run` via `onUsage`. The OpenCode
host invokes `onUsage` after reading the session and before it asserts success,
so a turn that then fails still contributes the tokens and model it consumed.
The failure comment reports elapsed time, attempts, and that partial usage.

Alternatives considered: reporting nothing on failure (rejected: the costly
turns are often the ones that fail); attaching usage to a typed error (rejected:
`onUsage` already exists and needs no new error surface).

### Decision: extend the existing usage shape, not a parallel one

`TurnUsage` gains a `model` and the per-kind token counts, and keeps `steps`,
`tokens` (the total, so the limiter is unchanged), and `durationMs`. The engine
fills `durationMs` and `attempts` when it renders. This keeps one usage
vocabulary across the runtime interface, the limiter, and the comment.

Alternatives considered: a separate `TurnMetrics` type (rejected: two nearly
identical shapes to keep in sync for no benefit); replacing `tokens` with the
breakdown (rejected: the limiter sums a single total and does not care about the
buckets).

## Risks / Trade-offs

- [A runtime reports usage only at the end, so a failure mid-turn under-reports
  tokens] -> acceptable: the comment states what was known, and the elapsed time
  and attempts are always exact.
- [Token counts differ from a provider's dashboard if cache accounting differs]
  -> the counts follow the platform's `TokenUsage` convention, and the design
  documents it.
- [A longer comment adds noise to every comment] -> the metrics are one compact
  line, and the issue explicitly asks for them on every comment.
- [The model line can be long for a variant] -> it is the same
  `provider/model#variant` form operators already configure, wrapped in code
  formatting.
- [Repeating the last turn's metrics can read as if the transition consumed
  tokens] -> the lifecycle line is labelled as the last turn's, so it is not
  mistaken for the transition's own cost.
- [A provider that strips HTML comments would lose the marker] -> only lifecycle
  comments are affected, and they degrade to an explicit unknown rather than
  omitting the metrics.

## Migration Plan

No data or configuration migration. Existing deployments pick up the new comment
line and marker after upgrading. Comments posted before the upgrade carry no
marker, so a lifecycle comment that repeats an older turn states the metrics as
unknown; that is harmless and self-corrects after the next turn. Rollback is a
revert; the comments already posted are immutable history but harmless.
