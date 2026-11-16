# Design

## Context

See `proposal.md` - Why for the incident and motivation. The relevant current
state:

- `.github/workflows/environments.yml` already reads the exact
  `@opencode/sdk` version from `package-lock.json` and passes it as
  `OPENCODE_SDK_VERSION`; the Dockerfile installs precisely that version.
- `metadata-action` currently emits `latest`, the branch name, semantic tags,
  and commit SHAs. None of them expresses the SDK version.
- `ContainerOpenCodeClient` reads `environment.image` verbatim, passes
  `expectedSdkVersion` to the mounted runner, and rejects a turn when the
  container reports a different version.
- An `environment.image` without a tag is currently Docker's implicit
  `:latest`.

## Goals / Non-Goals

**Goals:**

- Make the published SDK version discoverable from the image reference.
- Make an untagged project image mean "the image for *my* SDK version" so a
  stale checkout keeps working after `latest` moves.
- Keep explicit tags and digests an escape hatch for third-party images.

**Non-Goals:**

- Removing `latest` or the existing commit tags.
- Introducing application-level release versions; the SDK version is the
  compatibility contract this change relies on.
- Validating images at startup by starting a probe container.
- Changing the SDK mismatch guard, the runner mount, or the image contract.

## Decisions

### Decision: Tag images with `sdk-<version>`

Add one metadata tag to every publish:

```yaml
type=raw,value=sdk-${{ steps.sdk.outputs.version }}
```

The version already resolved for the build argument is the single source of
truth, so the tag and the installed SDK cannot disagree. `latest`, branch,
semver, and SHA tags stay for humans and for existing configurations.

Alternative considered: tag by the orchestrator's `package.json` version.
Rejected because that version does not move with Dependabot SDK bumps, so the
tag would point at images with different SDKs. Alternative considered: only
`latest` plus a startup probe. Rejected because it reports drift rather than
preventing it.

### Decision: Resolve untagged references in the container client

A small pure helper in `src/runtime/opencode/container-client.ts`
(`resolveImageReference(image, sdkVersion)`) returns `image:sdk-<version>` when
the reference names no tag, and the input unchanged when it already names a tag
or a digest. `ContainerOpenCodeClient.runSkill` applies it when building the
`docker run` arguments.

Tag detection must split on the last `/`, then look for `:` after it, so a
registry port (`localhost:5000/agent`) is not mistaken for a tag. A reference
containing `@` (a digest) is returned verbatim.

Alternatives considered: resolve in the config loader. Rejected because the
loader has no access to the runtime's resolved SDK version and because explicit
configs should keep their text. Alternative considered: a new `imageTag`
configuration field. Rejected as extra operator burden when the SDK version is
already known.

### Decision: Keep explicit tags verbatim and keep the mismatch failure

An operator who pins `:latest`, a commit tag, or a third-party image should get
exactly that reference. The existing ready-event check stays the guard: an
explicitly tagged image built for another SDK fails the turn with both versions
in the message.

### Decision: Untagged means the SDK tag for every image, not only project images

The rule is uniform and documented: untagged means "the tag for this
orchestrator's SDK version". Third-party images must name a tag, which they
should anyway because their SDK must match. Applying a prefix rule only to
`ghcr.io/wuan/simple-orchestrator/` would be implicit magic and would not help
forks or mirrored registries.

## Risks / Trade-offs

- [An older SDK has no `sdk-*` tag yet] -> a deployment still on that SDK can
  update its checkout, or use an existing commit tag, or retag an existing
  multi-platform index with
  `docker buildx imagetools create -t <image>:sdk-<version> <image>:<sha-tag>`.
- [A third-party untagged image now resolves to a tag that may not exist] ->
  **BREAKING** and documented; such images must name a tag explicitly.
- [A `sdk-*` tag moves when the same SDK is rebuilt with toolchain changes] ->
  the SDK contract still holds; a host that needs the newer toolchain re-pulls
  the tag.
- [`latest` remains a footgun for hand-written configs] -> documentation stops
  recommending it and explains that it follows `main`; the mismatch guard still
  fails such turns with an actionable message.

## Migration Plan

1. Land the workflow tag and the resolver; the next `main` build publishes
   `sdk-<current version>`.
2. On each host, update the checkout and `npm ci` so the orchestrator's SDK
   matches a published tag, then switch `environment.image` to the untagged
   project reference (or an explicit `sdk-*` tag).
3. A host that cannot update yet pins an existing `sha-*` image built with its
   SDK, or retags that index as `sdk-<version>`.
4. Rollback is configuration-only: pin an explicit image tag again. The
   resolver leaves tagged references untouched.

## Open Questions

None.
