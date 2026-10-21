# Design

## Context

See `proposal.md` - Why. The constraints that shape the approach:

- `.github/workflows/environments.yml` discovers the flavours from
  `environments/Dockerfile`, resolves the `@opencode/sdk` version from
  `package-lock.json`, registers QEMU, and builds one image per flavour with
  `docker/build-push-action`, pushing only outside pull requests.
- That build passes `platforms: linux/amd64,linux/arm64` and no
  `provenance`/`sbom`, so buildx applies its default provenance attestation.
  Inspecting `ghcr.io/wuan/simple-orchestrator/node:latest` shows an index whose
  first two entries are the two platforms and whose remaining two are
  attestation manifests with `os: unknown`, `architecture: unknown` and the
  `vnd.docker.reference.type: attestation-manifest` annotation - one per
  platform. The registry's UI and any tool that enumerates index platforms
  therefore report extra `unknown/unknown` images.
- The runner is `ubuntu-latest`, i.e. `linux/amd64`, so an arm64 build needs
  QEMU emulation. A pull-request build has no reason to emulate arm64: it
  validates the same Dockerfile, SDK pin, and discovery path, and pushes
  nothing. Pushes to `main` and version tags do publish and must stay
  multi-platform.

## Goals / Non-Goals

**Goals:**

- A published tag's image index lists exactly `linux/amd64` and `linux/arm64`.
- A pull request validates the images without emulating a non-native platform.
- Pushes to `main` and version tags keep publishing both platforms.
- The invariant test pins both behaviors so they cannot silently regress.

**Non-Goals:**

- Replacing attestations with another supply-chain mechanism; the issue asks for
  a clean platform list first.
- Changing the flavour discovery, tag policy, SDK pinning, or image contract.
- Changing the `environment.image` contract for consumers.
- Supporting platforms other than Linux on amd64 and arm64.

## Decisions

### Disable the build's provenance and SBOM attestations

Set `provenance: false` and `sbom: false` on the flavour build step. buildx
emits an attestation manifest for each output when provenance is enabled (its
default) and, when SBOM is enabled, another; those manifests carry
`unknown/unknown` platforms and are what the issue reports. Turning both off
keeps the emitted index to the two platforms. Alternatives considered: leaving
provenance on and teaching consumers to filter it (does not fix the contract or
the confusion), and stripping the manifests with `imagetools` after the build
(an extra authenticated registry round-trip for no benefit). The trade-off is
explicit: the published images no longer carry signed provenance/SBOM
attestations, which the issue accepts in exchange for a truthful platform list.

### Choose the platform set in an explicit step, not an inline expression

Add a `Select build platforms` step that writes `linux/amd64` on a pull request
and `linux/amd64,linux/arm64` otherwise to `GITHUB_OUTPUT`, and reference it as
the build's `platforms`. Alternative considered: an inline
`${{ github.event_name == 'pull_request' && '...' || '...' }}` expression on the
build step. The step form matches the existing `Resolve @opencode/sdk version`
step, and the invariant test can assert on a script string rather than a nested
ternary that is awkward to read and to test.

### Keep QEMU registration unconditional

QEMU is only needed for the emulated arm64 leg, but registering it is quick and
keeps the step list and the invariant test uniform; dropping it on pull
requests would save little and add a second conditional to reason about.

### Pin the platform selection and attestation settings in the invariant test

`src/runtime/opencode/environments.test.ts` already owns the workflow contract.
Extend it to assert that the build reads its platforms from the selection step,
that the selection script names both `linux/amd64` and `linux/arm64` and the
pull-request branch, and that the build disables provenance and SBOM. Asserting
the two platform strings keeps the previous "builds both platforms" guarantee
while the script assertion adds the PR-only-native behavior.

## Risks / Trade-offs

- [An arm64-only build failure is no longer caught in pull requests] -> pushes
  to `main` and version tags still build and publish both platforms, so the
  failure surfaces at publish time; `workflow_dispatch` also builds both, so a
  maintainer can pre-check a change by hand. This is the cost the issue trades
  for faster feedback.
- [Dropping provenance/SBOM reduces published supply-chain metadata] -> the
  image digests and platform index are unchanged, and provenance can be
  reintroduced later if a consumer can tolerate the `unknown/unknown` entries;
  the issue prioritizes a clean platform list.
- [A future default change re-enables attestations] -> the invariant test
  asserts `provenance: false` and `sbom: false`, so the regression fails CI.
- [Docs drift from the native-only PR build] -> document the distinction in
  `environments/README.md`, next to the existing multi-platform statement.

## Migration Plan

1. Land the workflow and test changes on a pull request; the PR build proves the
   native-only path and pushes nothing.
2. On the default branch, the next push republishes each flavour without
   attestation manifests, so the tags consumers already pull lose the
   `unknown/unknown` entries on their next refresh with no config change.
3. Rollback is restoring `provenance`/`sbom` and removing the selection step;
   the next default-branch push republishes the previous index. No orchestrator
   change is involved.

## Open Questions

None. The remaining choice - whether to reintroduce supply-chain attestations
through a channel that does not pollute the platform index - is deferrable and
would not change the specs or the task breakdown.
