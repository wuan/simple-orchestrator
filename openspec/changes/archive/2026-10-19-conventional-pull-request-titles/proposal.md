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
  `type` from an already-conventional issue title, else from the issue's labels
  (matched case-insensitively), else `feat`; a `scope` from an
  already-conventional issue title; and the `summary` from the issue title. A
  scope is added only when a conventional issue title or the applied commits
  make one clear; the title never carries an invented scope.
- **The summary is compacted as much as the project's convention allows.** The
  issue title is trimmed, its whitespace collapsed, a trailing period dropped,
  and the remainder shortened at a word boundary so the whole subject stays
  under the project's 72-character commit-subject limit (per `AGENTS.md`). A
  shortened summary ends with a single ellipsis, which re-compaction replaces
  rather than repeats. Compaction keeps the author's words: it never paraphrases
  or rewrites them.
- **No new configuration.** The type and scope are deduced, not configured: a
  repository that configures nothing still gets a conventional title, and an
  author can still choose a type or scope for one issue by writing the issue
  title conventionally (`fix: ...` or `docs(api): ...`), which is preserved.
- **The title is verified at the end of the apply job.** After an apply turn
  finishes and its commits are published, and before the workflow advances, the
  orchestrator derives the applied type and scope from the recognized
  Conventional Commit subjects the apply turn itself added - the outcome - and
  updates the pull request title when it differs, so the subject the host
  derives on merge reflects what was actually implemented. The applied type is
  used when the implementation subjects agree on one; a scope is adopted only
  when the implementation subjects agree on a type and the subjects that carry a
  scope agree on a single one (superseding a scope deduced from the issue
  title), and the summary the title already carries
  is kept - shortened further at a word boundary, replacing any ellipsis it
  already carried, only when the new type or scope would push the subject to the
  commit-subject limit - so an ambiguous outcome keeps the deduced type and
  scope. The propose turn's earlier commits are not the outcome and are not
  considered, and neither are OpenSpec bookkeeping subjects (a commit scoped
  `openspec`, such as the apply turn's archive commit), so a multi-commit turn
  still reconciles from its implementation. A title that does not parse as a
  recognized Conventional Commit subject, and an update that is not clear from
  the outcome, are left unchanged, and a failed outcome read or title update
  does not fail an otherwise successful workflow.
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
  scope from the issue context, compact the summary into a Conventional Commit
  subject, and rebuild a subject with a new type and scope while keeping its
  summary at reconciliation.
- `src/orchestrator/engine.ts` - compose the title with the helpers in `start`;
  after a successful apply turn, read the subjects that turn added and reconcile
  the title, updating it through the provider when it differs.
- `src/runtime/sandbox.ts` - a `SandboxHandle` method that lists the commit
  subjects a turn added (in `from..HEAD`), so the orchestrator can read the
  apply turn's outcome.
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
