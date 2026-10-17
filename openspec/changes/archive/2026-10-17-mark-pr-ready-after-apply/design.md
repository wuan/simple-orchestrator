# Design

## Context

`WorkflowEngine.start` opens one **draft** pull request per workflow and the
engine never changes its draft state afterwards. The apply turn implements the
change's tasks and folds `openspec archive` into its final commit, then the
engine records the `implementing` phase and waits for a merge. See proposal.md -
Why for the motivation.

Two host facts shape the approach:

- GitHub refuses to merge a draft pull request, so the workflow can only reach
  `done` if something releases the pull request from draft first.
- GitHub has **no REST endpoint** for the transition; the
  `markPullRequestReadyForReview` GraphQL mutation (what `gh pr ready` calls) is
  the only API. `ProviderPullRequest.draft` is already read from REST, so the
  orchestrator can observe the state but cannot change it today.

## Goals / Non-Goals

**Goals:**

- A pull request whose change has been implemented is ready for review, and
  therefore mergeable, without human intervention.
- The transition lives behind the provider seam, so other hosts can implement it
  their own way and core orchestration stays host-agnostic.

**Non-Goals:**

- Releasing the pull request during propose, or as soon as the change is READY;
  the issue scopes the transition to a successful apply, once the change is
  applied and archived.
- Converting a pull request back to draft.
- Changing how apply or archive is recorded, or how merge is detected.
- Releasing a pull request whose apply turn was interrupted between publishing
  its commits and the release call, or backfilling draft pull requests opened
  before this change ships; see Open Questions.

## Decisions

### Decision: release after apply, not at READY

The issue asks for the move "after the openspec changes have been applied
successfully", and the apply turn is what produces the implementation a reviewer
reviews. Releasing at READY would flip the pull request before any code exists
and would let a human merge a proposal whose tasks are untouched; keeping the
draft through propose and implementing also suppresses automatic CODEOWNERS
review requests until implementation is done.

The maintainer confirmed this timing on the pull request: the release happens
only once the change has been applied **and archived**, and draft-through-propose
is intentional. Because the apply turn folds `openspec archive` into its final
commit, "applied and archived" is the state the apply success path already
reaches; the release call sits on that path, after the publish.

This assumes GitHub still accepts reviews (including approvals) on a draft pull
request - only merging and automatic review requests are blocked - so the
existing approval gate keeps working while the pull request is a draft. If that
assumption is wrong, the release must move to the READY transition, which is a
small change because the transition is one engine call site; the risk is tracked
below.

### Decision: a provider operation, not host calls in the engine

`RepoProvider` gains `markPullRequestReady(pullRequest: PullRequestRef)`. The
engine calls it; the fake clears its stored `draft` flag; GitHub resolves the
pull request's GraphQL node id and runs the mutation. The shared provider
contract gains a case asserting a draft pull request becomes non-draft, so every
provider must implement it. Alternatives considered: calling the GitHub API from
the engine (rejected: host-specific code in core orchestration); adding a
general `draft: boolean` setter (rejected: nothing converts back, so a one-way
operation is smaller and clearer).

### Decision: GraphQL through the transport

Because GitHub exposes no REST endpoint, `GitHubTransport` gains a
`graphql(query, variables)` operation. `GitHubRest` POSTs `{ query, variables }`
to `/graphql`; `GhCliTransport` invokes `gh api graphql`. The provider reads the
pull request's `node_id` (already present in the REST pull payload) and calls
`markPullRequestReadyForReview(input: { pullRequestId })`. The in-memory GitHub
emulator used by the provider and contract tests gains a `/graphql` route and
returns `node_id` from its pull payload. Alternatives considered: shelling out
to `gh pr ready` (rejected: bypasses the transport and only works for the `gh`
transport, while tests and the REST transport need the same seam); a REST call
(rejected: does not exist).

### Decision: a failed release fails the workflow

The engine marks the pull request ready in the same success path as the publish,
before it records `implementing`. If it cannot - the credential lacks write
access, the mutation errors - the existing failure path marks the workflow
failed and posts the reason, rather than leaving a task-complete pull request
silently stuck in draft. The operation is idempotent: marking a pull request
that is already ready is a no-op, so a retry is safe.

## Risks / Trade-offs

- [GitHub blocks reviews on draft pull requests after all] -> the approval gate
  would be unreachable while draft, and the release would have to move to the
  READY transition. The transition is one engine call site, so moving it is
  small.
- [A release failure fails an otherwise successful implementation] -> intended: a
  change that cannot be reviewed and merged is not complete, and the failure is
  reported with its reason.
- [An extra GraphQL request per apply] -> once per workflow, and only on the
  apply success path, so it adds no polling cost.
- [The pull request is closed or merged when apply finishes] -> the mutation
  fails and the workflow is marked failed; merge detection is what finishes a
  merged pull request, and a closed one is cancelled by the poller.

## Migration Plan

None. A behavior change with no persistent state; deployments pick it up on the
next build and restart. Rollback is a revert.

## Open Questions

- Whether the poller should idempotently release an `implementing` pull request
  that is still draft, covering an apply turn interrupted between publishing its
  commits and the release (the phase is already `implementing`, so `recover` does
  not touch it) and a workflow left over from before this deploy. Deferred; the
  issue scopes the release to the apply success path, the operation is idempotent
  so a follow-up is cheap, and an operator can release the pull request from the
  host meanwhile.
- Whether draft pull requests opened before this change ships need a backfill.
  Deferred; the orchestrator only acts on workflows it is driving.
