# Proposal

## Why

The readiness predicate treats every artifact whose status is not `done` as
unfinished. OpenSpec reports an artifact declared absent by `skip_specs: true`
as `skipped`, which is a satisfied state, not unfinished work. A change that
legitimately sets `skip_specs` therefore never reaches READY: its propose turn
validates, the orchestrator labels it PROPOSING, and a human approval cannot
open the apply gate. This was observed on `oetztal/ledz` PR #26, where the
change `update-openspec-pin-to-2` validated under both 1.15.0 and 2.0.0 but
stayed `openspec:proposing` because its `specs` artifact was `skipped`.

Repository precedent already recorded this gap twice and deferred it to its own
change (`render-diagrams-with-mermaid`, `run-tests-once-in-ci`). This is that
change.

## What Changes

- The readiness predicate treats an OpenSpec artifact reporting `skipped` as
  satisfied, alongside `done`.
- The predicate still requires exactly one active change, at least one artifact,
  no artifact in any other state (such as `ready` or `missing`), and
  `openspec validate --strict` to pass.
- Document READY as satisfied by `done` or `skipped` artifacts so operators can
  use `skip_specs` for changes with no spec-level behaviour.

No change to the approval gate, labels, or OpenSpec CLI invocation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-orchestration`: the objective readiness predicate counts a
  `skipped` artifact as satisfied, so a change that declares `skip_specs` can
  reach READY and accept implementation approval.

## Impact

- `src/orchestrator/readiness.ts`: the artifact status check and its contract
  comment.
- `src/orchestrator/readiness.test.ts` and `src/orchestrator/engine.test.ts`:
  cover skipped artifacts and the READY phase they produce.
- `README.md`: the readiness description names `done` and `skipped`.
- `openspec/specs/workflow-orchestration/spec.md`: the readiness requirement and
  its scenarios after archiving this change.
