# Design

## Context

See `proposal.md` - Why. The relevant current behavior:

- `WorkflowEngine.runTurn` provisions a throwaway worktree, runs one skill,
  pushes the workflow branch, posts a turn comment, and then records the phase.
  A propose turn that leaves the change not ready re-applies `proposing`.
- `decide` starts a turn only from a fresh human review, so a `proposing`
  workflow with no review is idle forever.
- `recover` adopts only a pull request whose phase is missing or `failed`, and
  runs at most once per pull request per process.
- `SandboxHandle` exposes the workspace and whether the base is integrated but
  not the branch tip.
- `EmbeddedOpenCodeClient` always reports `commits: []`, `questions: []`, and
  `needsInput: false`, so runtime self-reports cannot identify a no-op turn.

## Goals / Non-Goals

**Goals:**

- A propose turn that does no work must not leave the workflow idling in
  `proposing`; it becomes a visible, recoverable failure.
- Detect "did no work" from repository state, not from agent prose or
  runtime self-reports.
- Keep state durable in host labels and stay safe across restarts.

**Non-Goals:**

- Changing how review-driven revise turns are triggered.
- Adding a bounded retry loop or a durable attempt counter.
- Making the agent produce a better proposal (a model-quality problem outside
  the orchestrator).

## Decisions

**1. Measure progress as the workflow branch tip before and after the turn.**
`SandboxHandle` gains a `head()` accessor (in `WorktreeSandbox` it is
`git rev-parse HEAD` in the workspace; `FakeSandbox` scripts it). The engine
reads the tip before `runtime.run` and after it; if they are equal, the turn
committed nothing. The base-integration merge, if any, is committed during
provisioning before the first read, so it is not mistaken for turn progress.

- Alternative: trust `TurnResult.commits`. Rejected: the embedded adapter always
  returns an empty list, so it carries no signal.
- Alternative: read the remote branch. Rejected: `provider.push` is a no-op when
  nothing changed, and the local worktree is authoritative anyway.

**2. Fail on a no-op propose turn only when the turn had no review trigger.**
`runTurn` already receives the triggering event (`trigger`). The initial turn in
`start` and the recovery turn in `recover` pass `null`; a review-driven revise
passes the review event. A no-op initial/recovery turn fails; a revise turn that
concludes there is nothing to change is allowed to be a no-op and keeps its
phase.

- Alternative: fail every no-op propose turn. Rejected: it would fail a
  legitimate "reviewer was wrong, no change needed" revise turn.

**3. Route the failure through the existing failure and recovery paths.**
The engine throws a `NoProgressError` from `runTurn`; the existing `catch`
calls `signalFailure`, which sets the `failed` label and comments. The next poll
then finds a `failed` pull request and `recover` re-runs the propose turn once
per process, as it already does for any failed workflow.

- Alternative: a retry counter in memory. Rejected: it resets on restart, so a
  restart while `proposing` would silently stall again - exactly the bug.
- Alternative: while `proposing` with no review, keep running propose turns
  until ready, bounded by `maxReviseRounds`. Rejected: it cannot distinguish a
  no-op turn from an agent that asked a question and is waiting for a human, and
  it contradicts the established "poll observes no change, take no action"
  behavior.

## Risks / Trade-offs

- **A propose turn that intentionally asks a question instead of committing is
  failed.** The embedded adapter never reports questions or `needsInput`, and the
  turn contract expects work to be committed, so this is acceptable; the failure
  comment is visible and recovery retries once. A future runtime that reports
  `needsInput` can exempt itself. → Mitigation: keep the check after the turn
  result is available, so a `needsInput` result can be exempted later without
  changing the spec.
- **The `head()` accessor widens the sandbox seam.** → Mitigation: it is one
  read-only method implemented in both the real and fake sandboxes, covered by
  the existing engine and sandbox tests.
- **A turn could produce an empty commit (new tip, no content change).** → Low
  impact: the turn still counts as progress, and the change remains `proposing`
  for a human to review.
