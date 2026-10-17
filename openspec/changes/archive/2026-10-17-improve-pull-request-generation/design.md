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
  a host-recognized closing keyword in the body (for example `Closes #<n>`)
  links the pull request to its issue and closes the issue on merge; a plain
  reference without the keyword links them but does not close the issue.

## Goals / Non-Goals

**Goals:**

- A reviewer can tell what a workflow pull request is about from its title,
  without opening the issue.
- The created pull request body no longer repeats the `Workflow for issue #<n>.`
  description.
- Keep the host closing reference, so merging still closes the issue.
- Keep the change small, localized, and free of new provider operations.

**Non-Goals:**

- Deriving the title from the generated OpenSpec change (its name or proposal)
  after the propose turn. That needs a provider operation to update the title
  and would rewrite the title on later turns.
- Updating or backfilling pull requests created before this change.
- Adding an orchestrator "close issue" operation; the host closing reference
  already closes the issue on merge.
- Configuring or capping the summary length.

## Decisions

**1. The summary comes from the issue title, composed at creation.**
`start` already holds the `ProviderIssue`, and the issue title is an objective,
human-written summary of the requested change that exists before the change
does. Alternatives: read the change name from `evaluateReadiness` after the
propose turn (rejected: requires a provider update operation, and the title
would change after the first turn); parse the proposal's prose (rejected: agent
text, which the readiness predicate deliberately avoids).

**2. The title is just the summary.**
The title becomes the issue's title, for example `Improve PR generation`. It no
longer carries the `OpenSpec change for issue #<n>` marker. Reviewers asked for
the title to be the summary alone; the issue is identified by the closing
reference in the body, so the title does not need to repeat the number.
Alternative: keep the marker and append the summary (rejected: the reviewer
asked for the summary alone).

**3. The body is only the closing reference.**
`pullRequestBody` returns just ``Closes #<n>``. The `Workflow for issue #<n>.`
line repeated what the title now summarizes, so it is dropped, while the closing
keyword is kept so a merge still closes the issue and the host cross-references
it.

**4. Compose both in the engine, not the provider.**
As with the existing body helper, the orchestrator owns the pull request
content and the provider only transports it, so the `RepoProvider` interface is
unchanged.

## Risks / Trade-offs

- **Issue titles can be long**, so the pull request title can be long. →
  Accepted for now; capping or deriving a shorter summary from the change would
  be a later change.
- **The title no longer names the issue number.** → The body's `Closes #<n>`
  links the pull request to the issue and closes it on merge; the branch also
  carries the association.
- **Pull requests created before this change keep the old title and body.** →
  Accepted: the provider has no update operation, and backfilling is one-time
  work.
