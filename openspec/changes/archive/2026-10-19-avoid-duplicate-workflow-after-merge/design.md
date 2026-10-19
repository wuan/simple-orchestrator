# Design

## Context

See `proposal.md` - Why. The behavior that shapes the fix:

- `Poller.pollOnce` lists the repository's open, trigger-labeled issues, then for
  each calls `provider.listPullRequestsForIssue(issue.ref)` and treats only a
  pull request whose `state` is `open` as the issue's active change. When there
  is none it calls `WorkflowEngine.start`, which repeats that listing and, when
  it still finds no open pull request, creates a draft pull request and runs the
  propose turn.
- `listTriggerIssues` only returns `open` issues, so the bug fires in the window
  between a pull request's merge and the host closing the issue.
- `ProviderPullRequest.state` distinguishes `open`, `closed`, and `merged`.
  GitHub's `listPullRequestsForIssue` queries
  `/pulls?state=all&head=owner:<branch>` and maps a non-null `merged_at` to
  `merged`, so a merged workflow pull request is already visible through the
  existing operation (`mapPullRequest`, covered by
  `src/provider/github/map.test.ts`).
- The association between an issue and its workflow pull request is the branch
  convention `openspec/issue-<n>` (`defaultIssueBranch`), which both the engine
  and the GitHub provider use.

## Goals / Non-Goals

**Goals:**

- A trigger-labeled issue whose associated pull request was merged SHALL never
  start another workflow, even before the host closes the issue.
- Keep the decision host-native and stateless: no new label, no local state.

**Non-Goals:**

- Detecting a merged pull request the orchestrator did not create, such as a
  human's pull request on an unrelated branch; the association stays the workflow
  branch convention.
- Treating a pull request closed without merge as resolving the issue.
- Changing the provider interface; the existing listing already reports merged
  pull requests.

## Decisions

### Treat any merged associated pull request as resolving the issue

`WorkflowEngine.start` already consults the issue's pull requests to avoid a
second active one. Extend that check: after ruling out an open pull request, if
any associated pull request has `state === 'merged'`, create no workflow and run
no turn. The poller and every direct caller then share one guard.

- Alternative: check only in `Poller`. Rejected because `start` is the public
  "begin a workflow" operation and already owns duplicate prevention; putting the
  rule only in the poller would let a direct caller recreate the bug.
- Alternative: treat any closed pull request as resolving the issue. Rejected
  because a closed-without-merge pull request is an inactive attempt, and the
  existing spec expects a new attempt to start at the current base.

### Report the merge through the start result

`StartResult` gains an optional `resolvedBy?: ProviderPullRequest`, set when a
merged pull request prevented the start. The poller logs it, so verbose
diagnostics name the issue and the merged pull request instead of silently
skipping it.

- Alternative: have `start` log directly. Rejected because the poller already
  owns poll-cycle diagnostics and knows the repository.

## Risks / Trade-offs

- [A host deletes the workflow branch on merge] -> GitHub keeps the pull
  request's head ref and `head=owner:<branch>` still matches it, so the merged
  pull request remains listed. If a future host drops merged pull requests from
  its issue-scoped listing, the guard would miss; the behavior is stated in the
  spec so that host can be extended then.
- [A merged pull request carries no lifecycle label] -> the issue-start path
  still skips it, so no duplicate is created; the workflow is simply not marked
  done, which is acceptable once the host closes the issue.
- [A human merges a pull request the orchestrator did not create] -> not
  detected; out of scope, the association is the workflow branch.
