# Tasks

## 1. Reclaim the branch

- [x] 1.1 Remove any worktree holding the target branch before adding a turn's
      worktree, and verify a sandbox test shows a worktree left by an
      un-disposed turn is reclaimed and the next turn succeeds

## 2. Verification

- [x] 2.1 Run `npm run verify` on Node 24 and verify format, lint, typecheck,
      tests, and OpenSpec validation all pass
- [x] 2.2 Confirm against the live workflow that a poll after the fix provisions
      its worktree and the turn completes

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
