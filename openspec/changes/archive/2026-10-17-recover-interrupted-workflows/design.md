# Design

## Context

Workflow state lives entirely in host labels plus the bot-comment watermark, and
the poller discovers in-flight work by label. Two label states are invisible to
discovery:

- **No lifecycle label** — `start()` creates the draft pull request and then runs
  the propose turn; the phase is only set *after* the turn. A crash in that
  window leaves an open, unlabelled pull request.
- **`openspec:failed`** — `signalFailure` sets the terminal `failed` label, and
  `lifecycleLabels()` deliberately excludes `failed` (and `done`).

In both cases the trigger-issue start path skips the issue because an open pull
request already exists (`poller.pollOnce`), so the workflow is stuck until a
human intervenes. The fix must let a restart pick these up without introducing a
hot retry loop or duplicating work.

## Goals / Non-Goals

**Goals:**

- Resume a stuck workflow on the next poll after a restart.
- Never start a second pull request for an issue that already has one.
- Bound retries so a permanently broken workflow does not spin.
- Add no durable state and no new labels.

**Non-Goals:**

- Recovering a `done` workflow, or a workflow whose trigger label was removed or
  whose pull request was closed (those are cancelled/finished as today).
- Distinguishing transient from permanent failures; the engine already retries a
  transient failure once inside a turn.
- Persisting a retry count across restarts.

## Decisions

### Decision: adopt a phase-less open pull request in the trigger-issue path

`pollOnce` already lists an issue's pull requests to decide whether to start. It
now also computes the phase of the open pull request from its labels:

- no open pull request -> `start()` as today;
- open pull request with an in-flight phase (`proposing`/`ready`/`implementing`)
  -> leave it to the existing lifecycle-label discovery;
- open pull request with **no phase or `failed`** -> call `engine.recover()`.

This keeps discovery in one place (the issue loop) and means no new label
enumeration is needed for recovery. A pull request with `done` on an open pull
request is left alone (it is a terminal state).

Alternatives considered: adding `failed` to `lifecycleLabels()` (rejected: it
would conflate in-flight discovery with recovery and drive it through the
review-watermark decision, which has no notion of a retry); closing the stale
pull request so a fresh one can start (rejected: loses the branch, and can loop).

### Decision: at most one recovery attempt per pull request per process

`WorkflowEngine` keeps an in-memory `Set` of pull-request numbers it has already
tried to recover. `recover()` adds the number before running the turn and returns
`false` on later calls. So each process attempts recovery once per pull request,
and a restart (a new process) grants exactly one more attempt. This is a
deliberate operator-visible bound: no infinite retry loop within a process, and a
restart is an intentional act that re-enables one retry.

The guard is in memory on purpose. It is *not* durable state: resetting on
restart is the feature ("retry on restart"), and nothing about correctness
depends on it surviving.

Alternatives considered: deriving a retry count from the number of failure
comments (rejected: retries every poll until the cap, hammering a broken
workflow); a cooldown from the last failure timestamp (rejected: needs a clock
and a configurable interval for little benefit).

### Decision: recovery runs a propose turn and does not pre-set the phase

`recover()` re-reads reviews and comments, then runs the propose turn exactly as
`start()` does. It does **not** set `proposing` first, mirroring `start()`: if the
process is interrupted mid-turn, the pull request is again phase-less and the
next restart recovers it, whereas pre-setting `proposing` would strand it as an
in-flight workflow awaiting a review that will never come.

## Risks / Trade-offs

- [A permanently broken workflow retries once per restart] -> accepted; the retry
  is bounded per process and each restart is deliberate.
- [Recovery of a failed apply turn re-runs propose] -> the phase before the
  failure is not recorded, so recovery always proposes. Proposing re-reads the
  transcript and is safe to repeat; a genuinely stuck apply may need human
  attention, which the failure comment already signals.
- [The in-memory guard is lost on restart] -> intended; documented here and in
  the proposal.
- [Closed pull requests with a stale `failed` label are cancelled once] ->
  harmless cleanup; `cancel` removes the label so it is not rediscovered.

## Migration Plan

Operational only. On the next poll after deploying, the orchestrator adopts any
open pull request left phase-less or `failed` and retries its propose turn once.
No data migration; rollback is a revert.

## Open Questions

None.
