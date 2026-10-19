# Tasks

## 1. Publish multi-platform images

- [x] 1.1 In `.github/workflows/environments.yml`, add `docker/setup-qemu-action` before the build and set `platforms: linux/amd64,linux/arm64` on the flavour build; verify the workflow YAML still parses and the flavour matrix, discovery, tags, and push-on-non-PR rule are unchanged.
- [x] 1.2 Confirm the buildx `type=gha` cache works for both architectures, adjusting the cache scope only if the two platforms thrash, and verify a repeated run restores a warm cache for both.
- [x] 1.3 Extend `src/runtime/opencode/environments.test.ts` to assert the workflow registers QEMU and builds both `linux/amd64` and `linux/arm64`, and that the flavour set still comes from the `FROM base AS <name>` stages; verify the test fails if either platform is dropped.
- [x] 1.4 Confirm on the pull-request run of this change that the build produces a two-platform image index and pushes nothing; verify the build log reports both platforms and the registry is untouched.
- [x] 1.5 Document the supported platforms in the `environments/README.md` "Published images" section, including that the host's container runtime selects the matching image; verify the section names `linux/amd64` and `linux/arm64` and the `ghcr.io/wuan/simple-orchestrator/<flavour>` location.
- [x] 1.6 Update `docs/configuration.md` (the `environment` `image` field) and the README deploy/agent-runtime notes to state the published platforms; verify `npm run format:check` and a documentation read show no reference to a single-platform image set.

## 2. Integration checks

- [x] 2.1 Run `npm run verify` and confirm the format check, lint, typecheck, unit and integration tests, and OpenSpec validation all pass.
- [x] 2.2 Manually build one flavour for both platforms locally (`docker buildx build --platform linux/amd64,linux/arm64 --target node --build-arg OPENCODE_SDK_VERSION=... environments`) and verify the result is an index covering both platforms.

## Workflow follow-up

- After the change is implemented and merged, confirm a default-branch publish republishes each existing tag as a two-platform index (`docker buildx imagetools inspect ghcr.io/wuan/simple-orchestrator/node:latest`) and that an arm64 host pulls the arm64 image without emulation.
- Archive the change after the project's review requirements are satisfied.
