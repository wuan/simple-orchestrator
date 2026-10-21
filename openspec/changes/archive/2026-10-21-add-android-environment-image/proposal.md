# Proposal

## Why

The turn environment images cover `node` and `rust`, but nothing that can build
an Android app: a repository whose turns run Gradle with the Android Gradle
Plugin has to fall back to the host or fail on a missing JDK and Android SDK,
and a turn cannot install a toolchain to recover. An Android repository becomes
a first-class citizen only once its toolchain is a published flavour.

An Android toolchain also breaks one property of the existing flavours: Google
publishes the Linux Android SDK command-line tools and build tools for `x86_64`
only, so unlike `node` and `rust` the flavour cannot run natively on
`linux/arm64`. The platform contract has to say so explicitly rather than
publish a mislabelled arm64 image.

## What Changes

- Add an `android` stage to `environments/Dockerfile` that installs a JDK and the
  Android SDK command-line tools with the platform, build tools, and platform
  tools a Gradle Android build needs, accepts the SDK licences, and exposes the
  SDK through the environment variables a Gradle build reads.
- Let a flavour stage declare the platforms it is published for (defaulting to
  both supported platforms) and declare `android` as `linux/amd64`, because
  Google's Linux Android SDK tools are `x86_64` only. The workflow derives the
  published platform set from the Dockerfile, so adding or restricting a flavour
  still needs no workflow edit.
- Record the Android toolchain and the per-flavour platform rule in the
  `environment-images` capability, document the flavour, and extend the
  environment-workflow invariant test.

Out of scope: installing the Android NDK, emulator, or a system Gradle (Android
projects use their Gradle wrapper); the `node` and `rust` flavours, the image
contract, the SDK pin, and the tag policy are unchanged.

## Capabilities

### New Capabilities

None. The image set and its platform contract are already owned by
`environment-images`.

### Modified Capabilities

- `environment-images`: a new requirement states that the `android` flavour
  provides the JDK and Android SDK toolchain a Gradle Android build needs; the
  platform requirement is generalised so a flavour is published for exactly the
  platforms its toolchain supports (both for `node`/`rust`, `linux/amd64` for
  `android`); and the Dockerfile-derived flavour set now also derives each
  flavour's platforms.

## Impact

- `environments/Dockerfile` - a new `FROM base AS android` stage with the JDK
  and Android SDK, a `# platforms: linux/amd64` declaration, and a comment
  explaining why the flavour is single-platform.
- `.github/workflows/environments.yml` - the flavour discovery emits a matrix of
  flavour and platforms; the build reads `platforms` per flavour instead of a
  single global set; pull-request builds stay native-only.
- `environments/README.md` - the flavour table, the Android prose and a usage
  snippet, and the platform-declaration rule.
- `src/runtime/opencode/environments.test.ts` - assert the Android toolchain and
  the per-flavour platform derivation.
- No runtime or configuration change: repositories point `environment.image` at
  `ghcr.io/wuan/simple-orchestrator/android` and add a Gradle cache volume.
