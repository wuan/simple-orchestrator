# Proposal

## Why

The apply turn is the only turn that turns an approved proposal into an
implementation, and it always archives the change, so it can never legitimately
commit nothing.

When an apply turn nevertheless finishes without committing anything - because
the agent stalled or stopped early - the orchestrator still pushes the
(unchanged) branch, posts the turn comment, marks the pull request ready for
review, and records the `implementing` phase. In `implementing` the orchestrator
reacts to nothing and waits for a merge, so the workflow is parked with a pull
request that carries no implementation: the human sees a ready-for-review pull
request, reviews it, and their reviews and comments drive nothing, while merging
it would ship only the proposal.

This is not hypothetical. It left `wuan/mqtt-gateway` pull request #410 stuck
after an apply turn that ended with "I'll wait for the test run to report back."
and no implementation commit; the human's "We are still missing the
implementation." review could not move it.

The initial and recovery propose turns already fail when the workflow branch tip
is unchanged (only review-driven revise turns may be no-ops), but the apply turn
has no equivalent guard.

## What Changes

- Fail an apply turn that finishes with the workflow branch tip unchanged,
  exactly like a propose turn without a triggering review: mark the workflow
  failed and report it, instead of marking the pull request ready for review and
  recording `implementing`.
- Keep a review-driven revise turn free to commit nothing, since it may only
  answer a question.
- Generalize the "produced no change" error so its message names the turn's
  skill.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-orchestration`: an apply turn that produces no change fails the
  workflow instead of advancing.

## Impact

- `src/orchestrator/engine.ts` - the no-progress check and `NoProgressError`.
- `src/orchestrator/engine.test.ts` - coverage for an apply turn that commits
  nothing and for one that commits its implementation.
- `README.md` - the IMPLEMENTING failure row lists a no-op apply turn among the
  causes.
