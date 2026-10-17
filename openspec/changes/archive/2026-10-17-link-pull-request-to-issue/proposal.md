# Proposal

## Why

The orchestrator opens a draft pull request for every issue, but its body is
only `Workflow for issue #<n>.`. That is a plain reference, not a host
closing keyword, so merging the pull request leaves the issue open: every
completed workflow needs a human to close its issue by hand. (Reported as
issue #11.)

## What Changes

- When the orchestrator creates a workflow's draft pull request, the body
  includes a host-recognized closing reference to the issue (`Closes #<n>`)
  alongside the existing short description, so the host links the pull request
  to the issue and closes the issue when the pull request is merged.
- The change covers pull requests the orchestrator creates from now on.
  Pull requests created before this change are not edited: the provider
  interface has no operation to update an existing pull request body, and
  backfilling old pull requests is a one-time concern rather than ongoing
  behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-orchestration`: the pull request a workflow creates must carry a
  closing reference to its issue so the host links the two and closes the issue
  when the pull request is merged.

## Impact

- **Code**: `src/orchestrator/engine.ts` — `start` currently hard-codes the
  pull request body; render it with the closing reference. Covered by
  `src/orchestrator/engine.test.ts`.
- **Docs**: `README.md` — state that merging a workflow pull request closes its
  issue.
- **State / APIs**: none. No new labels, credentials, or provider operations;
  the existing `createDraftPullRequest` body input carries the reference.
