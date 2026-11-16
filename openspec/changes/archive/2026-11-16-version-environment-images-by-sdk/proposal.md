# Proposal

## Why

Environment images are only published under movable tags (`latest`, `main`, and
commit SHAs), while the running orchestrator can be weeks behind `main`. When
`@opencode/sdk` is bumped, `latest` starts carrying an SDK the deployed runner
does not have, and every container turn fails with "the image's @opencode/sdk
version ... does not match the orchestrator's ...". This happened on the nyx
host: the orchestrator ran the SDK 2.0.32 checkout while Docker reused a
`latest` image built for SDK 2.2.5.

The SDK version is the actual compatibility contract between host and image.
Publishing an image tag for that version, and resolving untagged project images
to it, lets an orchestrator of any age pull an image it can actually run.

## What Changes

- CI publishes every flavour under an SDK-version tag
  (`ghcr.io/wuan/simple-orchestrator/<flavour>:sdk-<version>`) in addition to
  the existing tags, so each image build names the SDK it installs.
- The orchestrator resolves an untagged `environment.image` to the image's
  `sdk-<version>` tag using its own resolved `@opencode/sdk` version. An image
  reference that already names a tag, or a digest, is used verbatim.
- Documentation and examples point project images at the untagged reference
  (or an explicit SDK tag) instead of `latest`, and explain why `latest` is a
  movable pointer that must not be paired with a pinned checkout.
- The existing per-turn SDK mismatch check stays as the fail-fast guard for
  explicitly tagged third-party images.

**BREAKING**: an untagged `environment.image` no longer means Docker's implicit
`latest`; it means the orchestrator's SDK tag. Images that do not follow the
tag convention must name a tag explicitly.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `environment-images`: publish an SDK-version tag per flavour and document
  SDK-version pinning as the supported way to pair an image with a checkout.
- `agent-runtime`: resolve an untagged environment image to the orchestrator's
  SDK tag before running a turn, and keep the mismatch failure for explicit
  tags.
- `orchestrator-configuration`: define `environment.image` without a tag as the
  SDK-versioned image for the running orchestrator.

## Impact

- `.github/workflows/environments.yml`: add the SDK tag to the metadata tags.
- `src/runtime/opencode/container-client.ts` (plus a small image-reference
  helper and its tests): resolve the image tag before `docker run`.
- `src/config/*`: no schema change; `image` remains a non-empty string.
- `environments/README.md`, `docs/configuration.md`, and `README.md`: document
  the tag convention and stop recommending `latest`.
- `src/runtime/opencode/container-smoke.test.ts`: exercise the resolved tag
  against a real image when Docker is available.
- Rollout note: existing deployments must either update their checkout to the
  current `main` or use an explicit tag built for their SDK version until an
  `sdk-*` tag exists for it.
