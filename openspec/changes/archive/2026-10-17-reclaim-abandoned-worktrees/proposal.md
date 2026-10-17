# Proposal

## Why

A turn creates a `git worktree` on the workflow branch and removes it on dispose.
If the process is interrupted before dispose — a crash, or a restart mid-turn —
the worktree stays registered and keeps the branch checked out, and git refuses
to check the same branch out in a second worktree. The next turn then fails with
`fatal: '<branch>' is already used by worktree at ...`, and because
`Poller.pollOnce` drives that pull request every cycle, the workflow is stuck
until someone removes the stale worktree by hand.

## What Changes

- Before adding a turn's worktree, remove any worktree that still has the
  workflow branch checked out, so a crashed or interrupted turn never blocks
  later turns.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-runtime`: a turn reclaims a workflow branch left checked out by an
  interrupted turn, so the ephemeral sandbox is always provisionable.

## Impact

- **Code**: `src/runtime/sandbox.ts` (one extra step before `worktree add`) and
  its tests.
- **Operational**: interrupted turns self-heal on the next poll instead of
  requiring manual `git worktree` surgery.
- **Dependencies**: none.
