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
- BuildKit attaches attestations as manifests in the image index and has no
  option to keep them out while publishing them; the request for one
  (`docker/buildx#3047`) was closed without an opt-out. The only way to keep the
  supply-chain metadata is to publish it outside the index.
- The runner is `ubuntu-latest`, i.e. `linux/amd64`, so an arm64 build needs
  QEMU emulation. A pull-request build has no reason to emulate arm64: it
  validates the same Dockerfile, SDK pin, and discovery path, and pushes
  nothing. Pushes to `main` and version tags do publish and must stay
  multi-platform.

## Goals / Non-Goals

**Goals:**

- A published tag's image index lists exactly `linux/amd64` and `linux/arm64`.
- The provenance the build used to publish is retained, as a signed attestation
  attached to the published image rather than as an index entry, and an SBOM is
  published the same way.
- A pull request validates the images without emulating a non-native platform.
- Pushes to `main` and version tags keep publishing both platforms.
- The invariant test pins both behaviors so they cannot silently regress.

**Non-Goals:**

- Changing the flavour discovery, tag policy, SDK pinning, or image contract.
- Changing the `environment.image` contract for consumers.
- Supporting platforms other than Linux on amd64 and arm64.
- Adopting a signing service or key material; the attestations are keyless and
  bound to the workflow's OIDC identity.
- Replacing the attestation subject: it stays the published image, identified by
  its index digest.

## Decisions

### Publish attestations out-of-band instead of inside the index

Disable the build's in-index attestation manifests (`provenance: false`,
`sbom: false`) and attach the equivalent attestations after the push: generate
an SPDX SBOM with `anchore/sbom-action` and attach it with `actions/attest`, and
attach SLSA provenance with `actions/attest-build-provenance`, both with
`push-to-registry: true` so they land in the registry's attestation storage
keyed to the image digest. GitHub's keyless signing uses the workflow's OIDC
identity, so no key material is stored.

Alternatives considered:

- Leaving provenance/SBOM on and teaching consumers to filter the
  `unknown/unknown` entries: does not fix the index contract or the confusion the
  issue reports.
- Stripping the attestation manifests with `docker buildx imagetools create`
  after the build, keeping them under a dedicated tag: preserves buildkit's
  exact attestations, but they still live in the same registry package, so the
  registry still enumerates `unknown/unknown` for it, and the hidden reference is
  easy to miss.
- Keeping the buildx attestation behind a tag and filtering only the consumer
  tags: same problem as above, plus extra tag bookkeeping.
- Attaching buildkit's provenance through a separate channel: not possible;
  BuildKit only attaches attestations to the index it pushes
  (`docker/buildx#3047`).

The trade-off is explicit: the provenance is now GitHub-generated SLSA
provenance attached with a registry push rather than buildkit's, and consumers
verify it with `gh attestation verify` rather than
`docker buildx imagetools inspect`. The subject digest is unchanged.

### Choose the platform set in an explicit step, not an inline expression

Add a `Select build platforms` step that writes `linux/amd64` on a pull request
and `linux/amd64,linux/arm64` otherwise to `GITHUB_OUTPUT`, and reference it as
the build's `platforms`. Alternative considered: an inline
`${{ github.event_name == 'pull_request' && '...' || '...' }}` expression on the
build step. The step form matches the existing `Resolve @opencode/sdk version`
step, and the invariant test can assert on a script string rather than a nested
ternary that is awkward to read and to test.

### Skip the attestation steps on pull requests

The attestation steps run only when the build pushed (`if: github.event_name !=
'pull_request'`), because a pull request publishes nothing to attest and a fork
pull request has no OIDC token. The job adds `id-token: write` and
`attestations: write` for the non-PR runs only; the existing `packages: write`
already covers the registry push.

### Keep QEMU registration unconditional

QEMU is only needed for the emulated arm64 leg, but registering it is quick and
keeps the step list and the invariant test uniform; dropping it on pull
requests would save little and add a second conditional to reason about. The
reviewer confirmed this choice.

### Pin the platform selection and attestation settings in the invariant test

`src/runtime/opencode/environments.test.ts` already owns the workflow contract.
Extend it to assert that the build reads its platforms from the selection step,
that the selection script names both `linux/amd64` and `linux/arm64` and the
pull-request branch, that the build sets `provenance: false` and `sbom: false`,
and that the job attests the build's digest with a registry push in non-PR runs.
Asserting the two platform strings keeps the previous "builds both platforms"
guarantee while the script assertion adds the PR-only-native behavior.

## Risks / Trade-offs

- [The attestation format changes from buildkit's to GitHub's] -> both are SLSA
  provenance for the same image subject, and the SBOM is additive; the
  verification command changes from `imagetools inspect` to
  `gh attestation verify`, documented in `environments/README.md`.
- [An arm64-only build failure is no longer caught in pull requests] -> pushes
  to `main` and version tags still build and publish both platforms, so the
  failure surfaces at publish time; `workflow_dispatch` also builds both, so a
  maintainer can pre-check a change by hand. This is the cost the issue trades
  for faster feedback.
- [The attestation steps need extra permissions and a toolchain] -> the job
  gains `id-token: write` and `attestations: write`, and the steps are skipped on
  pull requests, so fork PRs stay read-only and a signed attestation is only an
  extra, non-blocking publish step.
- [A future default change re-enables in-index attestations] -> the invariant
  test asserts `provenance: false` and `sbom: false`, so the regression fails CI.
- [Docs drift from the native-only PR build] -> document the distinction in
  `environments/README.md`, next to the existing multi-platform statement.

## Migration Plan

1. Land the workflow and test changes on a pull request; the PR build proves the
   native-only path and pushes nothing.
2. On the default branch, the next push republishes each flavour without
   attestation manifests and attaches provenance/SBOM to the new digest, so the
   tags consumers already pull lose the `unknown/unknown` entries on their next
   refresh with no config change.
3. Rollback is restoring the in-index attestation defaults and removing the
   selection and attestation steps; the next default-branch push republishes the
   previous index. No orchestrator change is involved.

## Open Questions

None blocking. The attestation mechanism is a choice: the GitHub attestation
actions above need no installer, while `cosign` with a syft SBOM would attach
equivalent signed attestations through the Sigstore toolchain, and a dedicated
buildx tag would keep buildkit's exact provenance at the cost of a non-standard
reference and the `unknown/unknown` entries it still carries. The specs only
require equivalent attestations published outside the index, so switching tools
changes the tasks but not the specs.
