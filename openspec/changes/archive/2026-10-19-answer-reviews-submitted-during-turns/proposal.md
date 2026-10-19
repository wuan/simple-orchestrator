# Proposal

## Why

The orchestrator marks feedback as answered with the timestamp of its most
recent comment on the pull request: a review drives a turn only when it is
newer than that comment. A turn takes minutes, though, and its comment is posted
when it ends. A review submitted while a turn is running was never read by that
turn, yet it is older than the turn's comment, so it is treated as answered and
silently dropped; the reviewer has to submit it again. That contradicts the spec,
which requires a revise turn to incorporate all feedback since the previous turn.

## What Changes

- Every comment the orchestrator posts on a workflow pull request SHALL record,
  in an invisible machine-readable marker, the timestamp of the newest human
  review it had read when it acted (or that it had read none). The value is the
  host's own review timestamp, so the orchestrator's clock is never compared
  with the host's.
- The watermark SHALL be the newest such recorded review timestamp across the
  orchestrator's comments. A review newer than the watermark is new, so a review
  submitted during a turn drives the next turn.
- A comment without the marker, posted before this change, still counts with its
  own timestamp, so workflows already in flight keep their watermark.
- No configuration or label change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-orchestration`: the record that feedback was answered is the newest
  review the orchestrator had read, not the time of its comment, so feedback
  submitted while a turn runs is answered by the next turn.

## Impact

- `src/orchestrator/watermark.ts` (new) - render and parse the answered marker
  and derive the watermark from the orchestrator's comments.
- `src/orchestrator/engine.ts` - every pull request comment carries the marker;
  the decision's `lastTurnAt` comes from the watermark.
- `src/orchestrator/watermark.test.ts`, `src/orchestrator/engine.test.ts` -
  coverage for a review submitted during a turn, a restart, and legacy comments.
- `README.md` - the trigger rules no longer ask reviewers to resubmit.
