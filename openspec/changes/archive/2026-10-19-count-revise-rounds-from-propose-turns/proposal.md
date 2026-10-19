# Proposal

## Why

The revise limit (`maxReviseRounds`, default 3) is meant to bound the propose
turns a workflow spends on review feedback. The engine instead derives the
revise-round count from every comment the orchestrator authored on the pull
request, minus one. Comments that are not turns count too: the "ready for
development" prompt posted after every propose turn that reaches READY, failure
comments, cancellation comments, and the "could not update the title" notice.
A change that is ready after its first turn therefore starts at one round
instead of zero and spends two rounds per revise, so with the default limit the
second review already fails the workflow. That contradicts the spec, which
counts the orchestrator's own turns.

## What Changes

- The revise-round count SHALL be the number of propose turns the orchestrator
  posted on the pull request, minus the initial one. A propose turn is
  recognised by the heading of its turn comment (`**OpenSpec propose turn**`),
  which every propose turn comment already carries, so workflows already in
  flight are counted correctly without migration.
- Readiness prompts, failure, cancellation, completion, and title notices no
  longer count toward the limit; neither do apply turns.
- No configuration, label, or comment-format change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-orchestration`: the revise-round count covers only the
  orchestrator's propose turns, so its other comments no longer use up the
  revise limit.

## Impact

- `src/orchestrator/engine.ts` - the revise-round count classifies comments by
  the propose turn heading, shared with the turn comment it posts.
- `src/orchestrator/engine.test.ts` - coverage for a ready workflow that gets
  the full revise budget and for non-turn comments that do not count.
- `README.md` - the revise-limit rule describes the corrected count.
