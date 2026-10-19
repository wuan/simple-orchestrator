# Proposal

## Why

The draft pull request the orchestrator opens for an issue is titled with the
issue title verbatim, for example `Allow to extract default values from the
configuration to avoid repeating information`. On a squash merge the host uses
that title as the commit subject, so the default branch receives a commit that
does not follow the project's Conventional Commit convention even though the
turns' own commits do. (Reported as issue #35.)

## What Changes

- **The created pull request title is a deduced Conventional Commit subject.**
  Instead of the issue title alone, the orchestrator composes
  `<type>(<scope>): <summary>` by deducing the parts from the issue context: the
  `type` from an already-conventional issue title, else from the issue's labels,
  else `feat`; a `scope` from an already-conventional issue title; and the
  `summary` from the issue title. A scope is added only when the issue context
  or the applied outcome makes one clear; the title never carries an invented
  scope.
- **The summary is compacted.** The issue title is trimmed, its whitespace
  collapsed, a trailing period dropped, and the remainder shortened at a word
  boundary so the whole subject stays within the project's commit-subject limit
  (72 characters, per `AGENTS.md`).
- **No new configuration.** The type and scope are deduced, not configured: a
  repository that configures nothing still gets a conventional title, and an
  author can still choose a type or scope for one issue by writing the issue
  title conventionally (`fix: ...` or `docs(api): ...`), which is preserved.
- **The title is verified at the end of the apply job.** After an apply turn
  finishes and its commits are published, the orchestrator derives the applied
  type and scope from the turn's Conventional Commit subjects - the outcome -
  and updates the pull request title when it differs, so the subject the host
  derives on merge reflects what was actually implemented. An update that is not
  clear from the outcome is skipped, and a failed update does not fail an
  otherwise successful workflow.
- **A provider operation updates the title.** The provider contract gains an
  operation to set a pull request's title (GitHub `PATCH
  /repos/{owner}/{repo}/pulls/{number}`), so reconciliation is host-agnostic.
- The change covers pull requests the orchestrator creates and updates from now
  on. Existing pull requests are not backfilled.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-orchestration`: the created workflow pull request title becomes a
  deduced, compacted Conventional Commit subject, and the title is reconciled
  with the applied outcome at the end of the apply turn.
- `repo-provider`: adds an operation to update a pull request's title, with a
  GitHub implementation.

## Impact

- `src/orchestrator/title.ts` (new) - pure helpers that deduce the type and
  scope from the issue context and compact the summary into a Conventional
  Commit subject.
- `src/orchestrator/engine.ts` - compose the title with the helpers in `start`;
  after a successful apply turn, read the applied commit subjects and reconcile
  the title, updating it through the provider when it differs.
- `src/runtime/sandbox.ts` - a `SandboxHandle` method that lists the workflow
  branch's commit subjects ahead of the base, so the orchestrator can read the
  applied outcome.
- `src/provider/types.ts`, `src/provider/contract.ts`,
  `src/provider/fake/fake-provider.ts`, `src/provider/github/provider.ts`,
  `src/provider/github/testing/in-memory-github.ts` - the `updatePullRequest`
  operation and its test doubles.
- `src/orchestrator/title.test.ts` (new), `src/orchestrator/engine.test.ts`,
  `src/orchestrator/testing/fake-sandbox.ts`, `src/runtime/sandbox.test.ts`,
  `src/provider/github/*.test.ts` - tests.
- `README.md` - document the deduced, compacted title and the post-apply
  reconciliation.
- No configuration change, no new dependency, and no change to how an issue is
  labeled or discovered.
