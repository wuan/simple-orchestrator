# Proposal

## Why

The published environment image index is supposed to cover exactly
`linux/amd64` and `linux/arm64`, but inspecting a real tag shows two extra
entries with `os: unknown` / `architecture: unknown`: the buildx provenance
attestation manifests that `docker/build-push-action` adds by default, one per
platform. The "we publish only the supported platforms" contract is therefore
not true, and the phantom entries confuse tooling and readers that enumerate an
image's platforms. Separately, pull-request verification spends minutes
emulating arm64 even though a PR is only validated, never published, so the
feedback loop is slower than it needs to be.

## What Changes

- Stop emitting the buildx attestation manifests (disable provenance and SBOM)
  so a published tag's index lists only the supported platforms. **BREAKING**
  for anyone relying on the provenance/SBOM attestations: they are no longer
  published.
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
  build but do not publish" gains the native-platform-only PR build.

## Impact

- `.github/workflows/environments.yml` - a platform-selection step, the build
  step's `platforms` input, and the build's `provenance`/`sbom` inputs.
- `environments/README.md` - note that a pull-request build validates only the
  native platform while publications remain multi-platform.
- `src/runtime/opencode/environments.test.ts` - assert the platform selection
  and that attestations are disabled.
- The image index format changes (no attestation manifests); consumers that read
  the index see only the two supported platforms. No runtime, configuration,
  Dockerfile, or dependency change.
