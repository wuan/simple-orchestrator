# Proposal

## Why

When a workflow's pull request is merged, the host may take a while to close the
issue it closes. Until then the issue still carries the trigger label and has no
open pull request, so the next poll cycle mistakes it for new work and starts a
second workflow, opening a duplicate pull request for an already-implemented
change (reported as issue #43).

## What Changes

- Before starting a workflow for a trigger-labeled issue, the orchestrator
  checks whether any pull request associated with the issue has been merged. If
  one has, it starts nothing, even though the host has not yet closed the issue.
- A pull request closed without being merged does not resolve the issue, so a
  workflow may still start for it.
- The discovery path reports the skip, so verbose diagnostics show why the issue
  was left alone.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-orchestration`: starting a workflow requires that no pull request
  associated with the issue has already been merged, so a merged change is never
  implemented a second time while the host catches up and closes the issue.

## Impact

- `src/orchestrator/engine.ts` - `start` treats a merged pull request for the
  issue like an existing change and reports it instead of creating another.
- `src/orchestrator/poller.ts` - the discovery loop logs and skips an issue
  resolved by a merged pull request.
- `src/orchestrator/engine.test.ts`, `src/orchestrator/poller.test.ts`,
  `src/orchestrator/e2e.test.ts` - coverage for the merge race.
- No provider, label, configuration, or durable-state change:
  `listPullRequestsForIssue` already returns merged pull requests.
