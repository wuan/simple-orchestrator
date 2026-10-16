# Design

## Context

`WorktreeSandbox.create` runs `git worktree prune` and then
`git worktree add --track -B <branch> <path> origin/<branch>`. `prune` only
forgets registrations whose directories are gone; a worktree whose directory
still exists stays, and its branch stays checked out. Git rejects checking the
same branch out twice, so the `add` fails and the whole turn throws.

The engine's `runTurn` calls `sandbox.create` outside its `try`, so the throw
propagates out of the poll cycle. Under `--once` that aborts the run; under the
poll loop it is logged and the next cycle hits the same wall. Observed in
practice after the process was restarted mid-turn.

## Goals / Non-Goals

**Goals:**

- A stale worktree from a crashed turn never blocks a later turn.
- Keep the fix inside the sandbox seam; no orchestration change.

**Non-Goals:**

- Cleaning stale temporary directories generally (the store and `prune` cover
  the registrations; leftover empty parent dirs are harmless).
- Reusing a crashed turn's worktree; each turn still gets a fresh one.

## Decisions

### Decision: remove any worktree holding the target branch before adding

`create` now parses `git worktree list --porcelain` and, for every entry whose
`branch` is `refs/heads/<branch>`, runs `git worktree remove --force <path>`
before `prune` and `add`. This targets exactly the conflicting worktree and
leaves unrelated ones alone.

Alternatives considered: `git worktree add --force` (rejected: it permits the
same branch in two worktrees, which is the hazard we are removing); deleting the
stale registration by hand (rejected: needs path discovery anyway and would not
remove the directory); `git worktree prune --expire now` (rejected: does not
remove a worktree whose directory still exists).

### Decision: removal is best-effort and idempotent

`releaseBranch` ignores a non-zero `worktree list` and lets `worktree remove`
fail silently toward the existing error handling; if nothing holds the branch it
does nothing. A normal, disposed turn has no entry to remove, so the common path
is a single extra `worktree list`.

## Risks / Trade-offs

- [Removing a worktree another process is actively using] -> the engine runs one
  turn at a time and the branch is only checked out by a turn or a crashed turn;
  documented as a non-goal for concurrency.
- [An extra `git worktree list` per turn] -> negligible next to the clone/fetch
  the turn already performs.

## Migration Plan

None. A code-only fix; the next poll reclaims any worktree left by an
interrupted turn.

## Open Questions

None.
