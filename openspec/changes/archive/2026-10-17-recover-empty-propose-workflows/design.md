# Design

## Context

See `proposal.md` - Why. The relevant current behavior:

- `decide` starts a turn only from a fresh human review, so a `proposing`
  workflow with no review returns `idle` forever.
- `recover` adopts only a pull request whose phase is missing or `failed`, and
  runs at most once per pull request per process.
- `SandboxHandle` exposes the workspace, the branch tip (`head()`), and whether
  the base is integrated, but not whether the branch differs from the base.
- The workflow branch is seeded with an empty commit whose tree is the base
  tree, so a workflow that never committed a proposal has no diff against the
  base - an objective, host-visible signal.

## Goals / Non-Goals

**Goals:**

- A `proposing` workflow with no proposal must not idle forever; it must be
  retried and either produce the change or fail visibly.
- Distinguish a stalled workflow from a legitimate in-flight proposal using
  repository state, not agent prose or a durable attempt counter.
- Reuse the existing once-per-process recovery guard and stay safe across
  restarts.

**Non-Goals:**

- Changing how review-driven revise turns are triggered.
- Making the agent produce a better proposal (a model-quality problem outside
  the orchestrator).
- Adding a bounded retry loop or a durable attempt counter.

## Decisions

**1. Detect a stalled `proposing` workflow by diffing the branch against base.**
`SandboxHandle` gains `hasChanges()`. `WorktreeSandbox` implements it as `git
diff --quiet origin/<base> HEAD` (exit 1 means a difference). A `proposing`
branch with no change has no proposal, so nothing exists for a human to review.
An unresolved base merge also needs a turn, so `!baseIntegrated()` is treated as
stalled too.

- Alternative: reuse the runtime's `TurnResult.commits`. Rejected: the embedded
  adapter always returns an empty list, so it carries no signal.
- Alternative: assume every `proposing` workflow without a fresh review is
  stalled. Rejected: it would re-run legitimate proposals on every restart,
  duplicating work the spec says not to duplicate.
- Alternative: read the remote pull request's `changed_files`. Rejected: the
  GitHub list endpoint the poller uses returns `changed_files: null`, so it
  cannot be trusted without an extra API call per poll.

**2. Run the check inside the engine, once per pull request per process.**
`WorkflowEngine.recoverStalled` provisions one workspace, checks the branch, and
hands the same workspace to the propose turn when the workflow is stalled, so a
stalled recovery costs a single provision. It records the pull request in the
existing `recovered` set before checking, so the check and any retry happen at
most once per process.

- Alternative: check in the poller and provision a second workspace for the
  turn. Rejected: two provisions per recovery for no benefit.

**3. Route the retry through the existing turn and failure paths.**
`recoverStalled` calls the same `runTurn('propose', ...)` used everywhere else.
A turn that commits nothing throws `NoProgressError`, which marks the workflow
`failed` and comments on the pull request; the existing per-process guard then
prevents a loop.

## Risks / Trade-offs

- **A legitimate proposal is checked (one workspace provision) on each restart.**
  → Low impact: the check is read-only, finds the change, and disposes the
  workspace without running a turn; it happens once per `proposing` pull request
  per process, not per poll.
- **A conflicted base merge is treated as stalled.** → Intended: such a workflow
  needs a turn to resolve it, and a turn that still leaves the base unintegrated
  fails with `BaseIntegrationError`.
- **The `hasChanges()` accessor widens the sandbox seam.** → Mitigation: it is
  one read-only method implemented in both the real and fake sandboxes, covered
  by the existing sandbox and engine tests.
