# Tasks

## 1. Constrain the published image index

- [ ] 1.1 In `.github/workflows/environments.yml`, set `provenance: false` and `sbom: false` on the flavour `docker/build-push-action` step so buildx emits no attestation manifests; verify the workflow YAML still parses and the step's `tags`, `push`, `build-args`, and cache inputs are unchanged.
- [ ] 1.2 Extend `src/runtime/opencode/environments.test.ts` to assert the build step disables provenance and SBOM; verify the test fails when either input is removed or set back to `true`.

## 2. Build only the native platform on pull requests

- [ ] 2.1 Add a `Select build platforms` step (with an `id`) before the build that writes `linux/amd64` for `pull_request` and `linux/amd64,linux/arm64` otherwise to `GITHUB_OUTPUT`, and set the build's `platforms` to that output; verify the workflow YAML parses and a pull request still pushes nothing.
- [ ] 2.2 Extend the invariant test to assert the build reads `platforms` from the selection step and that the selection script names both `linux/amd64` and `linux/arm64` and the pull-request branch; verify the test fails if arm64 is dropped from the publish path or the pull-request branch is removed.
- [ ] 2.3 State in `environments/README.md`, next to the multi-platform paragraph, that a pull-request build validates the runner's native `linux/amd64` platform while publications cover both platforms; verify `npm run format:check` passes and the text names both platforms and the PR-native limitation.

## 3. Integration checks

- [ ] 3.1 Run `npm run verify` and confirm the format check, lint, typecheck, unit and integration tests, and OpenSpec validation all pass.
- [ ] 3.2 On the pull-request run of this change, confirm the build log reports only `linux/amd64` and the registry receives no push; on a default-branch publish, confirm `docker buildx imagetools inspect ghcr.io/wuan/simple-orchestrator/node:latest` lists exactly `linux/amd64` and `linux/arm64` with no `unknown/unknown` entry.

## Workflow follow-up

- After the change lands, confirm each republished flavour tag's index contains exactly the two supported platforms.
- Archive the change once the project's review requirements are satisfied.
