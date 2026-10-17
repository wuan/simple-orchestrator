# Proposal

## Why

A workflow can be left in the `openspec:proposing` phase with a workflow branch
that carries no proposal at all. This happens when an initial propose turn
commits nothing and the workflow was recorded as proposing before the no-op
guard existed, or when a turn's work is lost. The branch then differs in no way
from the base, so there is nothing for a human to review.

The fix in `recover-stalled-propose-turns` detects a no-op turn while it is
running, but it cannot repair a workflow already parked in `proposing`: the
poller only recovers a pull request whose phase is missing or `failed`, and the
watermark decision returns `idle` for `proposing` with no new review. Running
`node dist/run.js --config config.yaml --once -v` against such a workflow
therefore does nothing and leaves no new feedback on the pull request, as
happened to issue #11 / PR #12.

## What Changes

- A `proposing` pull request whose workflow branch carries no change relative to
  the base is treated as a stalled workflow and recovered: the orchestrator
  re-runs the propose turn once per process, which either produces the change or
  fails and reports on the pull request.
- A `proposing` pull request whose branch already carries a change is a normal
  in-flight proposal and is left to review-driven discovery, unchanged.
- The check is objective (a git diff of the workflow branch against its base),
  not a reading of agent output, and it reuses the existing per-process recovery
  bound.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-orchestration`: recovery also adopts a `proposing` workflow whose
  branch carries no proposal, so a workflow parked in `proposing` without a
  change is retried and surfaced instead of idling forever.

## Impact

- **Code**: `src/runtime/sandbox.ts` (the sandbox handle exposes whether the
  branch differs from the base), `src/orchestrator/engine.ts`
  (`WorkflowEngine.recoverStalled`), `src/orchestrator/poller.ts` (invoke it for
  `proposing` pull requests), `src/orchestrator/testing/fake-sandbox.ts` and the
  sandbox, engine, and poller tests.
- **State**: no new labels or durable state; the workflow either produces a
  proposal or becomes `failed`, which is visible on the pull request.
- **Operational**: one extra workspace provision per `proposing` pull request
  per process, bounded by the existing recovery guard.
