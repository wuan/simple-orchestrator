# Design

## Context

See `proposal.md` - Why. The constraints that shape the approach:

- `environments/Dockerfile` defines each flavour as a `FROM base AS <name>`
  stage on a shared `base` (Node 24, git, and `@opencode/sdk` pinned by build
  argument). `.github/workflows/environments.yml` discovers those stages with
  `grep`, resolves the SDK version from `package-lock.json`, and builds one
  image per flavour with `docker/build-push-action` on `ubuntu-latest`, pushing
  only outside pull requests.
- That build never sets `platforms`, and `docker/setup-buildx-action` reports
  only the runner's `linux/amd64` platform, so every published tag is an
  amd64-only image index.
- A turn container runs the mounted, platform-independent runner and resolves
  `@opencode/sdk` (which has native addons) inside the image, so the image must
  match the orchestrator host's architecture to run natively.
- `node:24-bookworm-slim` and the Rust flavour's `rustup` toolchain both publish
  `linux/arm64` variants, and the orchestrator's design already reasons about
  hosts on different platforms.

## Goals / Non-Goals

**Goals:**

- Publish native images for `linux/amd64` and `linux/arm64` under the same tags,
  with no change to the existing triggers, tags, or image contract.
- Keep the Dockerfile as the single source of the flavour set and the lockfile
  as the single source of the SDK version.
- Make the supported platforms visible to operators and to the invariant test.

**Non-Goals:**

- Architectures or operating systems other than Linux on amd64 and arm64.
- Per-architecture tags or a separate registry interface.
- A container image for the orchestrator service, or forcing a pull per turn.
- Changing which layers or tools a flavour carries.

## Decisions

### One multi-platform build with QEMU, not a per-architecture matrix

Add `docker/setup-qemu-action` and pass
`platforms: linux/amd64,linux/arm64` to the existing build step. Buildx emits a
single image index for each tag, and the pulling host's Docker selects the
matching platform. Alternative considered: a matrix that builds one platform per
job and merges with `docker buildx imagetools create`. That avoids emulation and
is faster on native arm64 runners, but adds a second job, an artifact hand-off,
and a merge step for a low-volume image set. Start with the single-build form
because it keeps the workflow's shape (discovery, per-flavour job, cache, push
policy) intact; the workflow can move to native runners later without changing
the published interface.

### Buildx cache is scoped per flavour and platform

The current `type=gha,scope=<flavour>` cache must not let the two architectures
overwrite each other's layers. Keep the per-flavour scope and let buildx key the
platform into the cache, and verify the first multi-platform run reuses both
platform caches on the next run.

### The published index, not extra tags, carries the platforms

Both architectures stay behind the existing `latest`, branch, semver, and sha
tags, so an operator's `environment.image` does not change and the host's
runtime picks the image. Alternative considered: separate `-amd64`/`-arm64`
tags. Rejected because it pushes platform selection onto the operator and
multiplies tags for no benefit.

### Documentation states platforms and selection, not build mechanics

Document that published flavours cover `linux/amd64` and `linux/arm64` and that
Docker selects the matching image, so an operator knows a flavour is usable on
their host. Keep the build mechanics in the workflow and this design rather than
in operator documentation.

## Risks / Trade-offs

- [Emulated arm64 builds are slow and can hit timeouts] -> the gha build cache
  keeps repeat runs warm; if a flavour's toolchain build becomes a bottleneck,
  move that flavour to a native arm64 runner and merge with `imagetools create`
  without changing the tags.
- [A flavour's toolchain has no arm64 variant] -> the multi-platform build fails
  loudly for that flavour instead of publishing a half-working index; the
  flavour can then be pinned or its base changed deliberately.
- [Cache keys collide across architectures] -> scope the buildx cache per
  flavour and platform and confirm cache reuse on a second run.
- [Publishing two architectures doubles stored layers] -> layers shared with the
  base are deduplicated, and arm64-only toolchain layers are the unavoidable
  cost of native runs.
- [Documentation drifts from the workflow] -> the environment-image invariant
  test asserts the published platforms, and the docs name them explicitly.

## Migration Plan

1. Add QEMU and the `platforms` input to the existing build step; a pull-request
   build proves a two-platform index is produced without pushing.
2. Land on the default branch; the existing tags are republished as
   multi-platform indexes, so consumers pick up the matching architecture on
   their next pull with no config change.
3. Rollback is removing `platforms` and the QEMU step: the next default-branch
   push restores amd64-only tags. No orchestrator change is involved.

## Open Questions

- Which additional platforms to add if the orchestrator later supports hosts
  outside Linux on amd64/arm64. Deferrable; it changes neither the specs nor the
  task breakdown.
