# Proposal

## Why

In READY, the orchestrator starts implementation whenever the newest human
review is an approval, even one it has already answered. An approval submitted
while the change was still PROPOSING is treated as feedback and runs a propose
turn; when that turn reaches READY, the same approval starts the apply turn on
the next poll. The reviewer approved a change that was not finished, and the
proposal that is implemented is one no human has approved: the gate opens
without anyone acting.

## What Changes

- An approval SHALL start implementation only when it is newer than the
  watermark, that is, submitted after the orchestrator last acted on the
  workflow's reviews. An approval it has already answered leaves a READY
  workflow idle until a human approves again.
- An approval that arrives before the change is READY still drives a propose
  turn, as today; it no longer carries over to implementation.
- The claim (`openspec:implementing`, set before the apply turn) still ensures
  an approval is acted on at most once; no configuration or label change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-orchestration`: the human approval gate requires an approval newer
  than the orchestrator's last answered review, so an approval given before the
  change was ready does not start implementation.

## Impact

- `src/orchestrator/decision.ts` - an approval drives a turn only when fresh.
- `src/orchestrator/decision.test.ts`, `src/orchestrator/engine.test.ts` -
  coverage for a stale approval in READY and an early approval that reaches
  READY.
- `README.md` - the trigger rules and the transition table describe the gate.
