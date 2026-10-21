# Proposal

## Why

The published environment image index is supposed to cover exactly
`linux/amd64` and `linux/arm64`, but inspecting a real tag shows two extra
entries with `os: unknown` / `architecture: unknown`: the buildx attestation
manifests that `docker/build-push-action` adds by default, one per platform. The
"we publish only the supported platforms" contract is therefore not true, and
the phantom entries confuse tooling and readers that enumerate an image's
platforms. Separately, pull-request verification spends minutes emulating arm64
even though a PR is only validated, never published, so the feedback loop is
slower than it needs to be.

BuildKit attaches attestations as manifests inside the image index and offers no
way to keep them out while still publishing them; the request for an opt-out
(`docker/buildx#3047`) was closed without one. Keeping the supply-chain metadata
therefore means publishing it somewhere other than the index rather than
dropping it.

## What Changes

- Publish the provenance and SBOM as signed attestations attached to the
  published image digest (through the registry's attestation storage, for
  example with GitHub's attestation actions), instead of as buildx attestation
  manifests inside the image index. Every published tag's index then lists
  exactly `linux/amd64` and `linux/arm64` while the supply-chain metadata is
  retained and verifiable.
- On pull requests, build only the runner's native platform (`linux/amd64`), so
  verification is fast and still crosses the same Dockerfile, SDK-pinning, and
  discovery path.
- Keep pushing both `linux/amd64` and `linux/arm64` on pushes to `main` and
  version tags, so every published tag remains a native multi-platform image.
- Record both contracts in the `environment-images` capability and extend the
  environment-workflow invariant test to pin them.

## Capabilities

### New Capabilities

None. The build and publish behavior is already owned by `environment-images`.

### Modified Capabilities

- `environment-images`: the requirement "Environment images are published for
  every supported platform" is narrowed so a published index contains exactly
  the supported platforms and no unknown entry; the requirement "Pull requests
  build but do not publish" gains the native-platform-only PR build; and a new
  requirement states that provenance and SBOM are published as signed
  attestations outside the image index.

## Impact

- `.github/workflows/environments.yml` - a platform-selection step, the build
  step's `platforms`, `provenance`, and `sbom` inputs, the job's OIDC and
  attestation permissions, and steps that generate and attest the provenance
  and SBOM of each published image.
- `environments/README.md` - note that a pull-request build validates only the
  native platform while publications remain multi-platform, and where the
  attestations live.
- `src/runtime/opencode/environments.test.ts` - assert the platform selection,
  that the build emits no in-index attestation manifests, and that the published
  digest is attested.
- The image index format changes (no attestation manifests); consumers that read
  the index see only the two supported platforms. Attestations move to the
  registry's attestation storage, verifiable with `gh attestation verify`. No
  runtime, configuration, Dockerfile, or dependency change.
