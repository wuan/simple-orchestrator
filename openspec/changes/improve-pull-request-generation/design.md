# Design

## Context

See `proposal.md` - Why. The current state this builds on:

- `WorkflowEngine.start` (`src/orchestrator/engine.ts`) creates the draft pull
  request with a fixed title, ``OpenSpec change for issue #<n>``, and the body
  returned by `pullRequestBody(issue)`, currently
  ``Workflow for issue #<n>.\n\nCloses #<n>``.
- `RepoProvider.createDraftPullRequest` accepts `title` and `body` and passes
  them through; the interface has no operation to edit a pull request after
  creation.
- `ProviderIssue` carries the issue `title`, so `start` already has a
  human-written summary of the requested change before the propose turn runs.
- The pull request is associated with its issue internally (branch
  `openspec/issue-<n>`, `linkedIssue`, `issueNumberFromBranch`). Independently,
  the `#<n>` in the title and body is a host reference: the host cross-references
  the pull request and issue and shows both in each other's timeline. GitHub
  closes an issue automatically only for a merge whose pull request description
  or a commit message carries a closing keyword; a plain reference does not
  close it.

## Goals / Non-Goals

**Goals:**

- A reviewer can tell what a workflow pull request is about from its title,
  without opening the issue.
- The created pull request body no longer carries the redundant closing line.
- Keep the change small, localized, and free of new provider operations.

**Non-Goals:**

- Deriving the title from the generated OpenSpec change (its name or proposal)
  after the propose turn. That needs a provider operation to update the title
  and would rewrite the title on later turns.
- Updating or backfilling pull requests created before this change.
- Replacing the lost host auto-close with an orchestrator "close issue"
  operation.
- Configuring or capping the summary length.

## Decisions

**1. The summary comes from the issue title, composed at creation.**
`start` already holds the `ProviderIssue`, and the issue title is an objective,
human-written summary of the requested change that exists before the change
does. Alternatives: read the change name from `evaluateReadiness` after the
propose turn (rejected: requires a provider update operation, and the title
would change after the first turn); parse the proposal's prose (rejected: agent
text, which the readiness predicate deliberately avoids).

**2. The title keeps the issue reference and appends the summary.**
The title becomes ``OpenSpec change for issue #<n>: <issue title>``, for example
`OpenSpec change for issue #26: Improve PR generation`. This keeps the existing
generated marker, names the issue (so the host cross-references the pull request
to it), and adds the human summary the issue asked for. Alternative: replace the
title with the issue title alone (rejected: drops the marker and leaves the issue
reference only in the body).

**3. The body keeps the short description and drops the closing keyword.**
`pullRequestBody` returns just ``Workflow for issue #<n>.``. The `Closes #<n>`
line duplicated the reference already present in the title and body. The
consequence is deliberate: the host no longer auto-closes the issue on merge,
the issue stays cross-referenced, and closing it is part of the normal merge
workflow.

**4. Compose both in the engine, not the provider.**
As with the existing body helper, the orchestrator owns the pull request
content and the provider only transports it, so the `RepoProvider` interface is
unchanged.

## Risks / Trade-offs

- **Merging no longer closes the issue automatically.** Someone must close it
  after merge. → Documented in the proposal and README; the issue remains
  cross-linked from the title and body references, and the workflow still marks
  the pull request done. If automatic closure is wanted later, add an
  orchestrator close on the done transition rather than restoring the keyword.
- **Issue titles can be long**, so the appended summary can make a long pull
  request title. → Accepted for now; capping or deriving a shorter summary from
  the change would be a later change.
- **Pull requests created before this change keep the old title and closing
  line.** → Accepted: the provider has no update operation, and backfilling is
  one-time work.
