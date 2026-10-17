# Design

## Context

See `proposal.md` - Why. The relevant current behavior:

- `WorkflowEngine.start` creates the draft pull request with a fixed body,
  `Workflow for issue #<n>.`, and a title that names the issue. Neither is a
  host closing keyword, so the issue stays open after merge.
- `RepoProvider.createDraftPullRequest` accepts a `body` and passes it through;
  the interface has no operation to edit a pull request body after creation.
- Internally the pull request is already associated with its issue (branch
  `openspec/issue-<n>`, `linkedIssue`, `issueNumberFromBranch`), but that
  association is orchestration state, not a host closure.
- GitHub and GitLab both honor `Closes #<n>` (and `Fixes`/`Resolves`) in a pull
  request description or commit, and close the issue when the pull request is
  merged into the default branch.

## Goals / Non-Goals

**Goals:**

- Merging a workflow pull request closes its issue automatically, with no
  manual step.
- Keep the behavior host-agnostic: it works for the GitHub provider and the
  GitLab extension point without host-specific code.
- Keep the change small and localized.

**Non-Goals:**

- Editing or backfilling pull requests created before this change.
- Adding a provider operation to update a pull request body.
- Making the closing keyword configurable.

## Decisions

**1. Compose the closing reference in the engine, not the provider.**
`start` already owns the pull request body, and `Closes #<n>` is understood by
both target hosts, so no provider-specific formatting is required and the
`RepoProvider` interface stays unchanged.

- Alternative: add a `closingReference` field to `CreatePullRequestInput` and
  let each provider render it. Rejected: it widens the interface for a syntax
  no target host needs to vary.
- Alternative: have the provider invent the body. Rejected: providers transport
  content; the orchestrator decides it.

**2. Use `Closes #<n>` as the keyword.**
It is the most common closing keyword and is recognized by GitHub and by
GitLab's default closing pattern. `Fixes` and `Resolves` are equivalent; one
keyword is enough and avoids ambiguity.

**3. Keep the descriptive line and add a dedicated closing line.**
The body becomes, for example:

```
Workflow for issue #7.

Closes #7
```

The human-readable context is preserved, and the keyword sits on its own line
so hosts scan it and tests can assert it unambiguously.

**4. Only newly created pull requests are affected.**
The provider seam deliberately has no "edit body" operation; adding one only to
migrate pull requests created before this change would broaden the interface for
one-time work. A pull request that predates the change (such as PR #12 for issue
#11) keeps its body and does not close its issue on merge; adding the reference
to it by hand is enough, and every pull request the orchestrator creates from
now on carries it.

## Risks / Trade-offs

- **The issue does not close when the base branch is not the host's default
  branch.** GitHub closes issues only for merges into the default branch. →
  Mitigation: the reference still links the pull request to the issue, the
  README documents the behavior, and the configured base branch is normally the
  default branch.
- **A host with a different closing syntax would need a code change.** →
  Accepted: the reference lives in the engine, and the two target hosts share
  the convention; a future host can extend the seam then.
- **Pull requests created before this change do not close their issues.** →
  Documented in the proposal and README; the reference can be added by hand.
