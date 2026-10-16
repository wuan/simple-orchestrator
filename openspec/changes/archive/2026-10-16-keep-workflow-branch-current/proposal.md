# Proposal

## Why

A workflow branch is cut from the base branch when the workflow starts and is
never updated afterwards. As the base advances, a long-running change drifts
from it: later turns (notably apply) build on stale code, the pull request
eventually conflicts and cannot merge, and a host stops creating
`pull_request` CI runs for a conflicting head. PR #7 hit exactly this: its
branch was seeded ten commits behind `main`, the apply commit conflicted in
seven files, and CI silently stopped running until the branch was merged up by
hand.

## What Changes

- **Integrate the current base branch before every turn** (a merge, never a
  rebase), so each turn starts on top of the latest base and the pull request
  stays mergeable.
- When that integration conflicts, **keep the conflicted workspace** and require
  the turn to resolve it; a turn that finishes without integrating the base
  **fails with a clear message** instead of pushing a stale branch.
- **Start a workflow from the current base**: when an issue has no active pull
  request, base (advance or replace) its branch on the current base rather than
  reusing a branch left behind by an earlier attempt.
- Tell the turn about a pending base merge so the agent resolves any conflicts
  as part of its work.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `repository-store`: provisioning a turn workspace also integrates the current
  base branch into the workflow branch.
- `workflow-orchestration`: a workflow starts from the current base, and a base
  branch that stays unintegrated fails the workflow instead of leaving an
  unmergeable pull request.

## Impact

- **Code**: `src/runtime/sandbox.ts` (merge the base during provisioning),
  `src/orchestrator/engine.ts` (verify base integration after a turn and fail
  otherwise), `src/provider/github/provider.ts` (`ensureWorkflowBranch` for a
  fresh start), and the OpenCode adapter prompt in
  `src/runtime/opencode/opencode-runtime.ts`.
- **Behavior**: a turn workspace may contain an in-progress merge; the approval
  claim, push policy, and phase labels are unchanged.
- **Dependencies / configuration**: none.
