# Proposal

## Why

A workflow whose first turn was interrupted (the process stopped between
creating the draft pull request and finishing the turn) or whose turn failed
leaves its pull request with no active lifecycle phase, or with the terminal
`openspec:failed` label. The poller only drives pull requests carrying an
in-flight label (`proposing`, `ready`, `implementing`), and it refuses to start a
new workflow while any open pull request exists for the issue. The result is a
dead end: restarting the service never resumes the workflow, and the operator
cannot restart it without manually closing the pull request or editing labels.

This is exactly what happened to issue #1: PR #6 and PR #7 were created, each
failed its first propose turn, and were then unreachable on restart.

## What Changes

- When a trigger-labeled issue already has an **open pull request without an
  active phase** (no lifecycle label, or `failed`), the poller re-runs the
  propose turn for that pull request instead of skipping it.
- The recovery is attempted **at most once per pull request per process**, so a
  restart gives a stuck workflow one more chance without the poll loop retrying
  forever.
- Report recovered issues in the poll result and log them alongside started work.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-orchestration`: an interrupted or failed workflow is recovered on a
  subsequent poll/restart rather than remaining permanently blocked behind its
  own open pull request.

## Impact

- **Code**: `src/orchestrator/poller.ts` (adopt phase-less open pull requests),
  `src/orchestrator/engine.ts` (`recover` plus its per-process guard),
  `src/index.ts` (log the recovered count).
- **Operational**: a restart now retries stuck workflows once; a workflow that
  keeps failing is retried once per restart, giving the operator a predictable
  bound.
- **State**: no new labels or durable state; the one-attempt-per-process guard is
  in memory and intentionally resets on restart.
