# Tasks

## 1. Add the pull policy to the configuration model

- [x] 1.1 In `src/config/types.ts`, add an `EnvironmentPull` union (`'always' | 'missing' | 'never'`), a `pull?: EnvironmentPull` field on `EnvironmentSpec`, and a `DEFAULT_ENVIRONMENT_PULL` constant defaulting to `'always'`; verify `npm run typecheck` passes.
- [x] 1.2 In `src/config/loader.ts`, read `pull` in `parseEnvironmentValues` and reject a value outside the union with a `ConfigError` naming the repository and the field; verify the existing `defaults`-over-entry merge carries it without further change.
- [x] 1.3 Extend `src/config/loader.test.ts` to cover an explicit policy, the merged default, and an unsupported value failing startup; verify each new test fails when the corresponding parse or validation is removed.

## 2. Emit the pull policy when starting a container

- [x] 2.1 In `src/runtime/sandbox.ts`, add `pull?: EnvironmentPull` to `DockerRunOptions` and emit `--pull <policy>` in `buildDockerRunArgs` (defaulting to `DEFAULT_ENVIRONMENT_PULL` when unset); keep the flag ahead of the image reference.
- [x] 2.2 In `src/runtime/opencode/container-client.ts`, resolve the policy from `environment.pull`, defaulting to `DEFAULT_ENVIRONMENT_PULL`, and force `missing` when the image reference encodes a digest (`...@sha256:...`), then pass it to `buildDockerRunArgs`.
- [x] 2.3 Extend `src/runtime/opencode/container-client.test.ts` to assert the default emits `--pull always`, that a configured policy is forwarded, and that a digest-pinned image emits `--pull missing` even when the policy is `always`; verify each assertion fails when the corresponding logic is removed.

## 3. Document the policy and the behaviour

- [x] 3.1 In `docs/configuration.md`, add `pull` to the `environment` field table with its default and add a short paragraph stating that the orchestrator refreshes the image before each turn, that a digest-pinned image is not re-checked, and that `missing`/`never` opt out; verify `npm run format:check` passes.
- [x] 3.2 In `environments/README.md`, state next to the published-images section that the orchestrator checks a mutable tag for a newer image before a turn, so a republished `latest` is picked up without a manual pull; verify the text names `latest` and the `environment.pull` opt-out.

## 4. Integration checks

- [x] 4.1 Run `npm run verify` and confirm the format check, lint, typecheck, unit and integration tests, and OpenSpec validation all pass.
- [x] 4.2 Add a Docker smoke check in `src/runtime/opencode/container-smoke.test.ts`, skipped when Docker is unavailable, that starts the local environment image with `pull: never` and confirms it runs from the cached image, then with `pull: always` and confirms Docker reaches for the registry instead of silently reusing the cache; verify the check is skipped without Docker and passes locally with it.

## Workflow follow-up

- After the change lands, confirm a repository tracking `latest` runs a newly published image without a restart or manual pull, and that an operator can pin or opt out through `environment.pull`.
