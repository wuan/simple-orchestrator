# Tasks

## 1. Configuration surface

- [ ] 1.1 Add a `PullRequestTitleConfig` type (`type`, optional `scope`) and an optional `pullRequest` field on `RepositoryConfig` and `RepositoryDefaults` in `src/config/types.ts`; verify `npm run typecheck` passes.
- [ ] 1.2 Parse, validate, and merge the `pullRequest` block through `defaults` in `src/config/loader.ts`, defaulting `type` to `feat` and failing fast naming the repository when the type is outside the documented Conventional Commit types or a field is empty; verify new unit tests cover the default, a configured type and scope, defaults inheritance, an entry override, an unknown type, and an empty field.
- [ ] 1.3 Document the `pullRequest` block in `docs/configuration.md` and add it to `examples/config.yaml`; verify the documented example loads by extending `src/config/examples.test.ts`.

## 2. Title composition

- [ ] 2.1 Compose the draft pull request title in `src/orchestrator/engine.ts` as `<type>(<scope>): <summary>` from the resolved `pullRequest` block and the issue title, preserving an issue title that already begins with a Conventional Commit prefix, and carry the block on `WorkflowEngineOptions`; verify `src/orchestrator/engine.test.ts` covers the default type, a configured type and scope, and an already-conventional issue title.
- [ ] 2.2 Thread the resolved `pullRequest` block from `src/service.ts` to the poller and engine, as `environment` already is; verify `src/service.test.ts` covers a repository with and without the block.
- [ ] 2.3 Update `README.md` to describe the conventional title and the per-issue passthrough; verify the documented behavior matches the engine tests.

## 3. Integration check

- [ ] 3.1 Run `npm run verify` and confirm formatting, lint, typecheck, tests, and OpenSpec validation all pass.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result updates the `orchestrator-configuration` and `workflow-orchestration` specs as the deltas describe.
