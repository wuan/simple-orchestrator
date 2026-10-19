# Proposal

## Why

The turn environment images are published to the GitHub Container Registry for
`linux/amd64` only. The orchestrator itself is platform-aware - the container
runtime resolves the OpenCode SDK inside the image "for its own platform" - and
an operator can run it on an arm64 host, so a repository that points at a
published flavour cannot always run it natively and must fall back to slow
emulation or fail. "Available on GHCR" should mean runnable on every platform
the orchestrator supports.

## What Changes

- Build and publish every environment flavour as a **multi-platform** image
  (`linux/amd64` and `linux/arm64`) from one `docker buildx` invocation, so the
  pulling host's Docker selects a native image. This is the missing piece of the
  current deployment; the wiring, discovery, tagging, and SDK pinning stay.
- Keep the flavour set derived from `environments/Dockerfile` (a single source
  of truth) and the `@opencode/sdk` version pinned from `package-lock.json`, so
  a new flavour or a dependency bump needs no workflow edit.
- Keep the trigger and tag policy unchanged: pull requests build without
  pushing, pushes to `main` and version tags publish `latest`, branch, semver,
  and sha tags.
- Document the supported platforms in `environments/README.md`,
  `docs/configuration.md`, and the README's deploy notes, including how a host
  picks the matching image.
- Extend the environment-workflow invariant test so the published platforms
  cannot silently regress.

Out of scope: a container image for the orchestrator service itself, changing
the image contract, having the orchestrator force a fresh pull each turn, and
platforms other than Linux on amd64 and arm64 (for example Windows containers).

## Capabilities

### New Capabilities

- `environment-images`: the project publishes its documented turn environment
  images to the GitHub Container Registry, per flavour, for every platform the
  orchestrator supports, deriving the flavour set from the Dockerfile and
  pinning the OpenCode SDK to the orchestrator's lockfile version.

### Modified Capabilities

None.

## Impact

- `.github/workflows/environments.yml` - add QEMU plus a multi-platform
  `platforms` input to the build step.
- `environments/README.md`, `README.md`, `docs/configuration.md` - state the
  supported platforms and the pull contract.
- `src/runtime/opencode/environments.test.ts` - assert the workflow publishes
  more than one architecture.
- No runtime or configuration behavior changes: the container client, the mount
  policy, and the `environment` block are untouched.
- Adds no new runtime dependency; the images continue to resolve
  `@opencode/sdk` for their own architecture.
