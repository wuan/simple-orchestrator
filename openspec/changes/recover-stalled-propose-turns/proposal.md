# Proposal

## Why

A propose turn that completes without producing or changing anything leaves its
pull request labeled `openspec:proposing`. The poller only starts turns from new
human review activity, and its recovery path only adopts a pull request whose
phase is missing or `failed`, so an in-flight `proposing` workflow with no review
is never driven again: it waits forever for a review that nothing prompts for.

This is what happened to issue #11 (PR #12). The first propose turn reported
success and posted "Now I'll write the proposal artifact." but committed nothing
to the branch, so readiness stayed unmet and every later poll idled with "no new
human activity". The workflow is a dead end that only a human editing labels or
closing the pull request can clear.

## What Changes

- A propose turn that runs **without a triggering review** (the initial turn or a
  recovery) and commits nothing to the workflow branch is treated as a failed
  turn: the workflow is marked `failed` and the failure is reported, instead of
  re-applying `proposing`.
- Because the phase becomes `failed`, the existing recovery path re-runs the
  propose turn once per process, so the stall is retried rather than silently
  parked.
- A **review-driven** revise turn may legitimately produce no commit (there is
  nothing to change); only propose turns without a review trigger are affected.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-orchestration`: a propose turn that produces no change no longer
  leaves the workflow idling in `proposing`; it fails so the workflow is
  recovered or surfaced instead of waiting for a review that never comes.

## Impact

- **Code**: `src/runtime/sandbox.ts` (the sandbox handle exposes the branch tip),
  `src/orchestrator/engine.ts` (compare the tip before and after a propose turn
  and fail a no-op turn), `src/orchestrator/testing/fake-sandbox.ts` and the
  engine/sandbox tests.
- **State**: no new labels or durable state; the workflow becomes `failed`, which
  is visible on the pull request and picked up by the existing per-process
  recovery guard.
- **Operational**: a stalled propose turn now surfaces as `openspec:failed` with
  one automatic retry per process, instead of idling without a trace.
