# Tasks

## 1. Remove the attestation manifests from the published index

- [x] 1.1 In `.github/workflows/environments.yml`, give the flavour `docker/build-push-action` step an `id` and set `provenance: false` and `sbom: false` so buildx emits no attestation manifests inside the index; verify the workflow YAML parses and the step's `context`, `target`, `tags`, `push`, `build-args`, and cache inputs are unchanged.
- [x] 1.2 Extend `src/runtime/opencode/environments.test.ts` to assert the build sets `provenance: false` and `sbom: false`; verify the test fails when either input is removed or set back to `true`.

## 2. Publish provenance and SBOM as signed attestations

- [x] 2.1 Add `id-token: write` and `attestations: write` to the build job's permissions and, after the build, add steps that run only when the build pushed (`if: github.event_name != 'pull_request'`): `anchore/sbom-action` to write an SPDX SBOM for `ghcr.io/${{ github.repository }}/${{ matrix.flavour }}@${{ steps.build.outputs.digest }}`, then `actions/attest` with `sbom-path` and `actions/attest-build-provenance`, both with `subject-name`, `subject-digest: ${{ steps.build.outputs.digest }}`, and `push-to-registry: true`.
- [x] 2.2 Extend the invariant test to assert the job attests the build's digest with a registry push and that every attestation step is gated to non-pull-request runs.
- [x] 2.3 State in `environments/README.md` that provenance and SBOM are published as signed attestations rather than index entries, and how to verify them (`gh attestation verify ghcr.io/wuan/simple-orchestrator/<flavour> --owner wuan`); verify `npm run format:check` passes.

## 3. Build only the native platform on pull requests

- [x] 3.1 Add a `Select build platforms` step (with an `id`) before the build that writes `linux/amd64` for `pull_request` and `linux/amd64,linux/arm64` otherwise to `GITHUB_OUTPUT`, and set the build's `platforms` to that output; verify the workflow YAML parses and a pull request still pushes nothing.
- [x] 3.2 Extend the invariant test to assert the build reads `platforms` from the selection step and that the selection script names both `linux/amd64` and `linux/arm64` and the pull-request branch; verify the test fails if arm64 is dropped from the publish path or the pull-request branch is removed.
- [x] 3.3 State in `environments/README.md`, next to the multi-platform paragraph, that a pull-request build validates the runner's native `linux/amd64` platform while publications cover both platforms; verify `npm run format:check` passes and the text names both platforms and the PR-native limitation.

## 4. Integration checks

- [x] 4.1 Run `npm run verify` and confirm the format check, lint, typecheck, unit and integration tests, and OpenSpec validation all pass.
- [x] 4.2 On the pull-request run of this change, confirm the build log reports only `linux/amd64` and the registry receives no push; on a default-branch publish, confirm `docker buildx imagetools inspect ghcr.io/wuan/simple-orchestrator/node:latest` lists exactly `linux/amd64` and `linux/arm64` with no `unknown/unknown` entry, and that `gh attestation verify ghcr.io/wuan/simple-orchestrator/node:latest --owner wuan` succeeds for both the provenance and the SBOM.

## Workflow follow-up

- After the change lands, confirm each republished flavour tag's index contains exactly the two supported platforms and that its attestations resolve.
- Archive the change once the project's review requirements are satisfied.
