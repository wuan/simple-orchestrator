# Tasks

## 1. Configuration model and loader

- [ ] 1.1 Add a `RepositoryDefaults` model holding the repository-entry fields except `name`, all optional, and verify it compiles against `RepositoryConfig`
- [ ] 1.2 Parse an optional top-level `defaults` block with the existing field helpers, rejecting a non-mapping value or an invalid field value with the established fail-fast messages, and verify loader tests cover a valid block and an invalid field
- [ ] 1.3 Resolve each scalar repository field as entry over `defaults` over the built-in default, and verify loader tests cover inheritance, per-entry override, and the built-in fallback when neither is set
- [ ] 1.4 Merge `labels` key by key across the built-in defaults, `defaults.labels`, and the entry's `labels`, and verify a test shows an entry overriding one label while inheriting another from `defaults` and the rest from the built-ins
- [ ] 1.5 Keep the parsed `OrchestratorConfig` fully resolved so `RepositoryConfig` entries never carry `defaults` state, and verify no downstream consumer needs to change

## 2. Validation and errors

- [ ] 2.1 Run required-field validation after the merge, so a repository whose `provider`, `owner`, or `credential` comes only from `defaults` is accepted, and verify a test parses such a configuration
- [ ] 2.2 Keep `name` required on every entry and fail with an error naming the entry when it is omitted even though `defaults` is present, and verify the error message
- [ ] 2.3 Fail with an error naming the affected repository when a required field is absent from both the entry and `defaults`, and verify the error message
- [ ] 2.4 Verify a configuration with no `defaults` block parses and resolves exactly as before the change

## 3. Documentation

- [ ] 3.1 Document the `defaults` block, the merge order, and which fields are defaultable in `docs/configuration.md`, and verify the documented example parses with `parseConfig`
- [ ] 3.2 Add a short `defaults` example to `README.md` that reduces a multi-repository configuration, and verify it matches `examples/config.yaml`
- [ ] 3.3 Update `examples/config.yaml` to demonstrate `defaults` while keeping it a valid, self-contained example, and verify `src/config/examples.test.ts` parses it

## 4. Verification

- [ ] 4.1 Verify `npm run verify` passes (format, lint, typecheck, unit and integration tests, and strict OpenSpec validation)
- [ ] 4.2 Verify the reduced configuration from the issue — a single `name` under a `defaults` block — parses and yields a repository equal to the fully-specified form

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result folds the shared-defaults requirement into the `orchestrator-configuration` main spec.
