# Proposal

## Why

Closing a workflow pull request without merging is meant to cancel the
workflow. But the issue keeps its trigger label, and each poll looks at
trigger-labeled issues before it drives in-flight pull requests: the issue has
no open pull request any more, so the poll starts a new workflow, with a new
draft pull request and a new agent turn, before it even processes the
cancellation. A reviewer who closes a pull request to reject it gets a fresh
one a poll later, and closing that one repeats the cycle, each round spending
another turn. A `failed` pull request that is closed is never seen as
cancelled at all and is replaced the same way.

## What Changes

- Closing a workflow pull request without merging SHALL cancel the workflow and
  remove the trigger label from its issue, so the workflow stays stopped until a
  human adds the label again. The cancellation comment says so.
- A trigger-labeled issue whose closed pull request still carries a phase label
  (`proposing`, `ready`, `implementing`, or `failed`) is a cancellation that has
  not been processed yet: the orchestrator cancels it and starts nothing.
- Adding the trigger label again afterwards starts a fresh workflow, because the
  cancelled pull request no longer carries a phase label.
- Removing the trigger label still cancels as before; no configuration or label
  name change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-orchestration`: closing the pull request without merge cancels the
  workflow and removes the issue's trigger label, and a closed pull request that
  has not been cancelled yet blocks a new start until it is.

## Impact

- `src/orchestrator/engine.ts` - one cancellation path that also removes the
  trigger label when the pull request was closed; `start` cancels an
  unprocessed closed pull request instead of starting.
- `src/orchestrator/poller.ts` - reports the cancellation in verbose output.
- `src/orchestrator/engine.test.ts`, `src/orchestrator/poller.test.ts` -
  coverage for closing in every in-flight phase, closing a failed pull request,
  and starting over by re-labeling.
- `README.md` - the "Leaving the happy path" table and the transition table.
