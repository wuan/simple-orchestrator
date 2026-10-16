# Proposal

## Why

Every turn re-clones the workflow branch into a throwaway directory and deletes
it at the end, so the orchestrator pays a full clone for each turn of each
workflow and the operator has no stable working copy to inspect. A persistent
per-repository clone amortizes that cost and gives operations a predictable
path, while turns still run in isolation.

## What Changes

- Add a **repository store**: one persistent clone per configured repository at
  `<root>/<owner>/<name>` (root defaults to `~/workspace`), created on first
  use and refreshed on later turns instead of re-cloned every turn.
- Run each turn in an **ephemeral git worktree** of the store checked out on the
  workflow branch, under the OS temp directory by default, and removed when the
  turn ends.
- Extend the provider seam with a `fetch` operation so the store is refreshed
  through the same credentials used to clone; allow `clone` to request a full
  (non-shallow) clone for the store.
- Add a `workspace` configuration block: `root` for persistent clones
  (default `~/workspace`) and an optional `worktrees` parent directory
  (default OS temp).

## Capabilities

### New Capabilities

- `repository-store`: a persistent, reusable clone per repository plus an
  ephemeral git worktree per turn, so turn isolation no longer requires a full
  clone every time.

### Modified Capabilities

- `agent-runtime`: the per-turn sandbox is now a worktree of the repository
  store rather than a fresh clone.
- `orchestrator-configuration`: the workspace root and worktree parent become
  configurable, with documented defaults.
- `repo-provider`: the provider interface gains a fetch operation (and clone
  gains a full-clone option) so the store can be refreshed with the repository's
  credentials.

## Impact

- **Code**: `src/runtime/` (new repository store, worktree sandbox replacing the
  ephemeral clone sandbox), `src/provider/` (clone/fetch), `src/config/`
  (workspace block), `src/service.ts` (wiring).
- **Operational**: a new on-disk path per repository (`~/workspace/<owner>/<name>`)
  the operator may want to back up or clean; turn worktrees remain under the OS
  temp directory and are still discarded.
- **Dependencies**: no new dependency; `git` was already required.
