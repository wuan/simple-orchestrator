# Design

## Context

See `proposal.md` for motivation. Today one component, `EphemeralWorkspaceSandbox`
(`src/runtime/sandbox.ts`), both clones the repository and hosts the turn: it
creates a temp directory and calls `provider.clone({ branch, destination })`,
which performs a shallow, single-branch clone of the workflow branch
(`git clone --branch <branch> --single-branch --depth 1`) directly into that
directory, then deletes it when the turn ends.

The constraints that shape this design:

- The orchestrator is stateless and sequential; the poller drives at most one
  turn at a time, so worktrees of one repository store are never used
  concurrently.
- Git transport is authenticated by the provider (through `gh` or a token), and
  the token must never be written to the clone's git config or argv.
- Turns run one OpenSpec skill each, commit to the workflow branch, and are
  discarded afterwards.

## Goals / Non-Goals

**Goals:**

- Clone each repository once and reuse it across turns and workflows, refreshing
  it before each turn.
- Keep per-turn isolation: each turn gets its own working tree, removed when the
  turn ends.
- Keep all authenticated git transport behind the provider seam.
- Make both locations configurable with documented defaults.

**Non-Goals:**

- Supporting concurrent turns against the same branch (the engine is sequential).
- Supporting a bare/mirror store, multiple worktrees per turn, or shared caching
  across machines.
- Changing the `Sandbox` interface, the engine, or turn semantics.

## Decisions

### Decision: Store layout `<root>/<owner>/<name>`

One persistent clone per configured repository, namespaced by owner and name so
different repositories (including same-named ones under different owners) never
collide. The root defaults to `~/workspace` and is configurable.

Alternatives considered: a flat `<root>/<name>` (rejected: collides across
owners); one store per workflow (rejected: no reuse benefit); a bare mirror
(rejected: worktrees from a bare store are less inspectable and the operator
loses a normal checkout).

### Decision: Full clone of the base branch, refreshed with `git fetch --prune`

The store is cloned with all branches (`git clone --branch <baseBranch> <url>
<dest>`, no `--single-branch`, no `--depth`) so workflow branches are available
as remote-tracking refs, and the store stays on the base branch. Before each
turn the store is refreshed with `git fetch --prune origin`.

Alternatives considered: a shallow single-branch store (rejected: workflow
branches are not fetched by the default refspec and shallow worktrees are
awkward); a shallow store fetched per branch (rejected: more moving parts for
little gain on a long-lived clone).

### Decision: Per-turn ephemeral worktree under the temp directory

Each turn gets `git worktree add --track -B <branch> <worktreePath>
origin/<branch>` from the store, where `worktreePath` lives in a fresh temp
directory (default OS temp, configurable parent). The worktree is removed with
`git worktree remove --force` and its local branch deleted when the turn ends,
with the temp directory removed as a fallback. `git worktree prune` runs before
each add so a stale registration from a crash cannot block a new worktree.

`-B` (create or reset the local branch) is used because the local branch may
survive from a previous turn; the branch is not checked out in the store, so
this does not conflict with the base-branch checkout.

Alternatives considered: a detached-HEAD worktree (rejected: the agent is told
to commit to the current branch and push, which a detached HEAD makes awkward);
reusing the store's checkout directly (rejected: breaks per-turn isolation).

### Decision: `fetch` and full `clone` live on the provider seam

`RepoProvider` gains `fetch(input)` and `CloneInput` gains `full?: boolean`.
`GitHubCloner` implements both transports: `TokenCloner` runs `git -C <dest>
fetch` with the token in `GIT_CONFIG_*` (never argv or config), and
`GhCliCloner` runs `git fetch` with `GH_TOKEN` exported, reusing `gh`'s
credential helper. This keeps authentication in one place and keeps the store
free of credentials.

Alternatives considered: storing the token in the clone's remote URL or git
config (rejected: violates the "no secret at rest / never in argv" rule);
giving the store its own git credentials (rejected: duplicates provider auth).

### Decision: `workspace` configuration block

```yaml
workspace:
  root: ~/workspace   # persistent clones (default)
  worktrees: /tmp     # per-turn worktrees (default: OS temp)
```

A leading `~` is expanded. `root` defaults to `~/workspace`; `worktrees` is
optional and defaults to the OS temp directory.

## Risks / Trade-offs

- [A stale worktree registration blocks a new turn] -> `git worktree prune`
  before each add, and `-B` resets a leftover local branch.
- [The store drifts from the remote] -> refresh (`git fetch --prune`) before
  every turn; the store is never the source of truth, the remote branch is.
- [Disk grows with one clone per repository] -> clones are small relative to
  repeated per-turn clones, and the root is configurable and cleanable.
- [Concurrent turns on one store could race `git`'s index] -> the engine is
  sequential (one turn at a time); documented as a non-goal.
- [Real `gh`/token fetch auth is not exercised by tests] -> tests inject a
  `RepositorySource` and use local git; the provider fetch path is covered by
  command-recording unit tests.

## Migration Plan

Operational only. Existing deployments keep working with defaults: the first
turn of each repository creates `~/workspace/<owner>/<name>`. Rollback: stop the
service and delete the store root; because the service is stateless, no other
state is affected.

## Open Questions

None.
