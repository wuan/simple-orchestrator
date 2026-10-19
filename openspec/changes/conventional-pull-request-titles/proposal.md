# Proposal

## Why

The draft pull request the orchestrator opens for an issue is titled with the
issue title verbatim, for example `Allow to extract default values from the
configuration to avoid repeating information`. On a squash merge the host uses
that title as the commit subject, so the default branch receives a commit that
does not follow the project's Conventional Commit convention even though the
turns' own commits do. (Reported as issue #35.)

## What Changes

- **The created pull request title is a Conventional Commit subject.**
  `WorkflowEngine.start` composes `<type>(<scope>): <summary>` instead of using
  the issue title alone: `summary` is the issue title, and `type` and optional
  `scope` come from a new optional `pullRequest` configuration block.
- **A default type keeps it zero-config.** `type` defaults to `feat` and no
  scope is applied, matching the spec-driven workflow's behavior changes, so a
  repository that configures nothing still gets a conventional title.
- **An already-conventional issue title is preserved.** When the issue title
  already begins with a Conventional Commit prefix (`type: ` or
  `type(scope): `), the orchestrator uses it unchanged, so an author can pick
  `fix`, `docs`, or a scope for a single issue without changing configuration.
- **The block is validated at startup.** An unknown type or an empty field
  fails startup naming the repository, in keeping with the other configuration
  blocks.
- The change covers pull requests the orchestrator creates from now on. The
  provider gains no update operation: the title is composed once, at creation,
  and existing pull requests are not edited.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `orchestrator-configuration`: adds an optional per-repository (and
  `defaults`) `pullRequest` block naming a Conventional Commit type and
  optional scope, with fail-fast validation.
- `workflow-orchestration`: the created workflow pull request title becomes a
  Conventional Commit subject composed from the issue title and the configured
  type/scope, instead of the issue title alone.

## Impact

- `src/config/types.ts` - a `PullRequestTitleConfig` type (`type`, optional
  `scope`) and a `pullRequest` field on `RepositoryConfig` and
  `RepositoryDefaults`.
- `src/config/loader.ts` - parse, validate, and merge the `pullRequest` block
  through `defaults`, failing fast naming the repository.
- `src/orchestrator/engine.ts` - compose `pullRequestTitle` from the issue
  title and the configured type/scope, preserving an already-conventional
  issue title; `WorkflowEngineOptions` carries the resolved block.
- `src/service.ts` - thread the resolved `pullRequest` block from the
  repository entry to the engine, as `environment` already is.
- `src/config/loader.test.ts`, `src/config/examples.test.ts`,
  `src/orchestrator/engine.test.ts`, `src/service.test.ts` - tests.
- `docs/configuration.md`, `README.md`, `examples/config.yaml` - document the
  block and the resulting title.
- No new dependency and no provider change.
