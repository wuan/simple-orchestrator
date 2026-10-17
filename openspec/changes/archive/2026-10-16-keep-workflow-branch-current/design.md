# Design

See `proposal.md` for motivation. This document covers how the orchestrator
keeps a workflow branch on top of its base.

## Context

- `WorktreeSandbox.create` (`src/runtime/sandbox.ts`) refreshes the persistent
  store with `git fetch --prune origin`, then runs
  `git worktree add --track -B <branch> <ws> origin/<branch>`. The turn therefore
  runs on the branch tip with no base integration.
- After a successful turn the engine pushes only the workflow branch
  (`assertPushAllowed` rejects force-push and protected branches), so integration
  must not rewrite published history.
- `GitHubProvider.ensureWorkflowBranch` (`src/provider/github/provider.ts`) seeds
  a branch from the current base, but deliberately leaves a branch that already
  has commits untouched — which is how PR #7 inherited a branch seeded ten
  commits earlier.
- `TurnContext` already carries `baseBranch`; the push policy and the approval
  claim are orthogonal and stay as they are.
- Evidence: PR #7's branch base was `7caa7c2` while `main` was `230c911`; merging
  `main` in conflicted in seven files, and GitHub stopped creating `pull_request`
  runs for the conflicting head until the branch was merged up.

## Goals / Non-Goals

**Goals:**

- Every turn workspace is based on the current base branch, so turns run on
  current code and the pull request stays mergeable (and keeps receiving CI).
- Integration conflicts are resolved by the turn, or fail the workflow loudly
  rather than shipping a stale branch.
- A fresh workflow does not inherit a stale branch from an earlier attempt.

**Non-Goals:**

- Rebase or any history rewrite (the push policy forbids force-push and a rewrite
  can dismiss approvals).
- Automatically resolving conflicts without the agent.
- Reading the host's mergeability or gating merges on CI.
- Changing the push policy, phase labels, or approval-claim flow.

## Decisions

### Decision: merge the base, never rebase

Integration merges `origin/<base>` into the workflow branch. A merge preserves
published history and needs no force-push, which `assertPushAllowed` rejects and
which can dismiss an approval; a merge commit also coexists with the apply turn's
"fold the archive into the final commit" flow. Rebase was rejected for the
force-push and approval-dismissal cost; a squash reset was rejected because it
discards the branch's provenance.

### Decision: integration is part of provisioning, exposed on the handle

`Sandbox.create` merges the base after checking the worktree out. A clean merge
lands a merge commit (or fast-forwards); a conflicted merge is left unresolved in
the workspace instead of failing provisioning. The handle exposes
`baseIntegrated(): Promise<boolean>` — whether `origin/<base>` is an ancestor of
`HEAD` — which is also how a pending merge is detected. Alternatives: having the
engine shell out to git (rejected: the engine has no git seam and the sandbox
already owns worktree concerns); integrating only before apply (rejected: propose
turns build on the same branch and drift just as badly).

### Decision: conflicts are the turn's job; an unresolved base fails the turn

After provisioning, the engine computes `pendingBaseIntegration =
!(await handle.baseIntegrated())` and puts it on the turn context. The OpenCode
adapter's prompt then tells the agent a base merge is pending and must be
resolved and committed. Before pushing, the engine re-checks `baseIntegrated()`;
if the base is still not integrated (for example, the agent aborted or ignored
the merge) it throws a permanent error, so the workflow is marked failed naming
the base branch and no stale branch is pushed. Failing immediately on conflict was
rejected because every conflict would then need a human; trusting the agent
without the post-turn check was rejected because a `git merge --abort` would ship
a stale branch silently.

### Decision: a fresh workflow resets the branch to the current base

`ensureWorkflowBranch` is only reached when an issue has no active pull request,
so when the branch already exists it is force-updated to a fresh seed commit on
the current base instead of being left stale. Keeping the "never touch a branch
with commits" rule was rejected: that is what let PR #7 start ten commits behind.

## Risks / Trade-offs

- [Extra merge commits on the branch] → accepted; the branch is a throwaway
  workflow branch and merges preserve provenance for the reviewer.
- [The agent resolves a conflict incorrectly] → the objective readiness predicate
  still gates propose, and apply is verified by the project's own gate before
  merge.
- [Conflicts recurring while the base keeps moving] → only where the base and the
  change genuinely overlap; the first turn that resolves them commits the
  resolution, so later turns merge cleanly.
- [Resetting a branch discards a previous attempt] → only when no pull request is
  active, so the discarded attempt is already closed.
- [An unexpected rewrite of published history] → none: integration is a merge,
  and the fresh-start reset only runs with no active pull request.

## Migration Plan

Operational; no persistent state. In-flight branches integrate the base on their
next turn. Rollback is a plain revert of the code. Already-merged branches are
unaffected.

## Open Questions

- Whether to also surface a host-reported mergeable/merge-state (and skip a turn
  when the base cannot be read) — deferrable; it changes no spec or task here.
