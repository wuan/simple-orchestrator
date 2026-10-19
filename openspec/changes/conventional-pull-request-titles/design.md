# Design

## Context

See `proposal.md` - Why. The current state this builds on:

- `WorkflowEngine.start` (`src/orchestrator/engine.ts`) creates the draft pull
  request with `pullRequestTitle(issue)`, which returns the issue title
  verbatim, and a body that carries only the closing reference. The provider
  (`RepoProvider.createDraftPullRequest`) transports the title and has no
  operation to edit a pull request afterwards.
- `ProviderIssue` carries the issue `title`, so `start` already has a
  human-written summary of the requested change before the propose turn runs.
- Repository configuration is a declarative list with optional `defaults`
  merged beneath each entry; `environment` shows the pattern for an optional
  block with a built-in default and fail-fast validation (`src/config/loader.ts`).
- The orchestrator's own turns commit with Conventional Commit messages, so a
  squash-merged pull request whose title is prose is the one non-conforming
  message the project produces.

## Goals / Non-Goals

**Goals:**

- The created pull request title is a Conventional Commit subject, so the
  message the host derives from it on merge follows the project convention.
- A repository that configures nothing still gets a valid subject.
- An author can choose the type and scope for a single issue without changing
  configuration.
- Keep the change localized: composition happens where the title already is
  composed, and no provider operation is added.

**Non-Goals:**

- Deriving the title from the generated change, its proposal, or the agent's
  first commit (that needs a provider update operation and rewrites the title
  after the first turn; previously rejected in
  `improve-pull-request-generation`).
- Editing or backfilling pull requests created before this change.
- Rewriting the issue title into an imperative sentence, or linting the entire
  subject. The type prefix is what makes the subject conventional; the summary
  stays the author's words.
- Inferring the type from issue labels (for example `bug` to `fix`). Left as a
  later enhancement, see Open Questions.

## Decisions

### Type and scope come from configuration, not inference

Add an optional `pullRequest` block with `type` (default `feat`) and optional
`scope`. Alternatives considered: infer the type from the issue's labels, or
have the agent name the title after proposing the change. Label inference is
guesswork on labels the workflow does not require and silently produces the
wrong type when they are absent; the agent route needs a provider update
operation and a mid-flight title change, which the previous title change
deliberately avoided. Configuration is explicit, testable, and already a
familiar surface.

### The default is `feat`, and the summary is the issue title verbatim

An OpenSpec workflow proposes behavior changes, so `feat` is the honest default
and makes the feature work with no configuration. The summary is the trimmed
issue title, not a rewritten sentence: the title is the human's own summary and
editing it risks changing its meaning. The consequence is that a declarative
issue title reads as a declarative commit subject (`feat: Allow to extract ...`),
which is acceptable; a stricter imperative rewrite would be a separate change.

### An already-conventional issue title passes through unchanged

Before composing, the title is checked for a leading Conventional Commit prefix
(`<type>: ` or `<type>(<scope>): `). If present, it is used as-is. This gives an
author a per-issue override for `fix`, `docs`, or a scope without touching
configuration, and it preserves issue titles that were written conventionally
on purpose. It also means the configured `type` is only a default, so an author
can still escape a repository-wide default.

### Compose in the engine at creation, and validate in the loader

Composition stays in the engine beside the existing body helper, so the
provider keeps transporting content and its interface is unchanged. Validation
lives in the loader with the other blocks: the type must be one of the
documented Conventional Commit types (`feat`, `fix`, `docs`, `test`,
`refactor`, `perf`, `build`, `ci`, `chore`) and neither field may be empty,
failing startup naming the repository. An unknown type is a configuration
mistake worth surfacing at startup rather than in a pull request title.

## Risks / Trade-offs

- [The issue title is not imperative, so the subject reads declaratively] ->
  Accepted; the type prefix is what the convention requires, and the summary
  stays the author's words. An imperative rewrite would be a separate change.
- [A long issue title makes a long subject line] -> Accepted for now; capping
  the summary is a later change and the previous title change accepted the same
  trade-off.
- [Constraining the configured type to a fixed set blocks a custom type] ->
  An author can still escape with a conventional issue title; the set matches
  the project's documented types and can grow in code when the project does.
- [A repository default of `feat` mislabels a fix] -> The author can override
  per issue with a conventional title, and the operator can set the repository
  default; label-based inference is deferred.
- [Pull requests created before this change keep a prose title] -> Accepted:
  the provider has no update operation, and backfilling is one-time work.

## Migration Plan

1. The block is optional and defaults to `feat`, so nothing changes for an
   existing configuration and no migration is required.
2. Add the configuration surface and validation; no behavior change until the
   title composition lands.
3. Compose the title in the engine and thread the block through the service.
4. Document the block and the passthrough rule.
5. Rollback is configuration-only: removing the block restores the built-in
   `feat` default, and reverting the engine change restores the issue title.

## Open Questions

- Should the type later be inferred from issue labels (`bug` to `fix`,
  `documentation` to `docs`, otherwise `feat`)? Deferred; it can be added
  without changing this contract, because the configured type remains the
  default.
