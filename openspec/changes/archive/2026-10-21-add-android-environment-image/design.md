# Design

## Context

See `proposal.md` - Why. The constraints that shape the approach:

- `environments/Dockerfile` defines each flavour as a `FROM base AS <name>`
  stage on the shared `base` (`node:24-bookworm-slim` plus git and the pinned
  `@opencode/sdk`). CI discovers those stages, builds each as a target, and
  publishes `ghcr.io/wuan/simple-orchestrator/<name>`.
- CI builds every flavour for `linux/amd64` and `linux/arm64` from one
  `platforms` input, so a flavour that cannot run on one of them currently has
  no way to say so.
- `base` is Debian bookworm, so the Android toolchain must come from packages
  and downloads available for that release.
- Google ships the Linux Android SDK command-line tools as
  `commandlinetools-linux-<build>_latest.zip` (`x86_64` only) and publishes
  `com.android.tools.build:aapt2` for the `linux` classifier (`x86_64`) with no
  `linux-arm64` classifier, so a Gradle Android build cannot run on a Linux
  arm64 host. The flavour therefore cannot be multi-platform.
- A turn runs as the orchestrator's uid/gid with a writable `HOME`, and the
  orchestrator mounts the runner and the repository paths read-only/at their
  host paths, so the image's toolchain must be usable by an arbitrary uid and
  must not depend on the build user's `$HOME`.
- `src/runtime/opencode/environments.test.ts` asserts the flavour set, the
  shared base, the multi-platform build, and the attestation settings from the
  Dockerfile and workflow text, and is the natural place to pin the new rules.

## Goals / Non-Goals

**Goals:**

- A published `android` flavour that builds a Gradle Android app in a turn
  without installing a toolchain: JDK, Android SDK command-line tools,
  `platform-tools`, an SDK platform, and build tools, with the SDK licences
  accepted and the SDK exposed through `ANDROID_HOME`/`ANDROID_SDK_ROOT`.
- Keep `node` and `rust` exactly as they are: multi-platform, contract
  unchanged.
- Publish `android` for exactly the platforms its toolchain supports
  (`linux/amd64`) and let the Dockerfile - not the workflow - name them, so
  adding or restricting a flavour still needs no workflow edit.
- Keep the invariant test the single place the image and workflow contract is
  pinned.

**Non-Goals:**

- Making Android builds run on `linux/arm64`; Google's Linux tooling does not
  support it, so the flavour declares one platform instead of emulating.
- Installing the Android NDK, the emulator, or a system Gradle distribution;
  Gradle comes from the repository's wrapper.
- Changing the image contract, the SDK pin, the tag policy, or the attestation
  behaviour.
- Pre-installing every SDK platform or build-tools version; Gradle resolves a
  project's declared versions against the accepted licences.

## Decisions

### Install the JDK and Android SDK in an `android` stage on `base`

Append a `FROM base AS android` stage. Install `openjdk-17-jdk` (the JDK the
Android Gradle Plugin requires, present in bookworm), `unzip`, and `curl`,
download the pinned Linux command-line tools, then use `sdkmanager` to install
`platform-tools`, a recent SDK platform, and build tools, and to accept the SDK
licences. Set `ANDROID_HOME` and `ANDROID_SDK_ROOT` to `/opt/android-sdk` and
prepend `cmdline-tools/latest/bin` and `platform-tools` to `PATH`, and
`chmod -R a+rwX` the SDK so an arbitrary-uid turn can read and execute it and
Gradle can install the components a project resolves.

Alternatives considered:

- Install the Android SDK in `base`: rejected, it would leak the JDK and SDK
  into `node` and `rust` and into the image contract, exactly the drift the
  base/flavour split prevents.
- Use a third-party `androidsdk/android-*` base image: rejected, it breaks the
  "every flavour is `FROM base` and inherits the contract in one place" rule and
  would need its own Node.js and `@opencode/sdk` pinning.
- Bake in a system Gradle: rejected, Android repositories ship a Gradle wrapper
  that pins their Gradle version; the image should not pick one.

The exact JDK, command-line-tools build, SDK platform, and build-tools versions
are implementation choices pinned in the Dockerfile as build args with defaults;
the spec only requires that a Gradle Android build finds what it declares.

### Declare each flavour's platforms in the Dockerfile

A flavour stage may carry a `# platforms: <comma-separated list>` comment; it
applies to the next `FROM base AS <name>` stage and defaults to
`linux/amd64,linux/arm64`. The `android` stage declares `linux/amd64`. The
discovery step reads the comment and emits a matrix of `{flavour, platforms}`;
the build reads `matrix.platforms` (restricted to the runner's native platform
on a pull request, as today).

Alternatives considered:

- Hard-code an exception for `android` in the workflow: rejected, it puts the
  flavour set in two places again and makes "adding a flavour needs no workflow
  edit" false.
- A separate list file (for example `environments/platforms.json`): rejected, it
  is a third artifact to keep in step with the Dockerfile; the comment keeps the
  declaration next to the stage it describes.
- Publish `android` multi-platform anyway: rejected, the arm64 image would carry
  `x86_64` SDK binaries that cannot run on an arm64 host, contradicting "the
  host's runtime pulls an image that runs natively".
- Build `android` only locally, unpublished: rejected, the issue asks for an
  environment image the orchestrator can point at by tag.

### Keep the platform rule in the spec, the mechanism in the test

The spec states the observable rule - a flavour is published for exactly the
platforms its toolchain supports - and the invariant test pins the mechanism:
the discovery parses `# platforms:`, `android` declares `linux/amd64`, and the
build reads the per-flavour set. A future flavour that forgets to declare a
restriction keeps the both-platforms default, and one that declares a set is
published for exactly that set.

## Risks / Trade-offs

- [The Android SDK layer is large] -> the SDK download and the pre-installed
  platform/build tools add several hundred megabytes to one image; only the
  `android` flavour pays it, and a Gradle cache volume keeps per-turn work small.
- [`sdkmanager` changes its package names or licences] -> pin the
  command-line-tools build and the package versions in the Dockerfile, and have
  the build fail rather than publish an image missing the SDK; the local
  verification task exercises `sdkmanager`.
- [`linux/amd64`-only is a real limitation] -> it is stated in the flavour's
  documentation and in the spec, and a host on arm64 gets a clear pull failure
  for `android` rather than a broken image; `node` and `rust` stay
  multi-platform.
- [The per-flavour platform parsing drifts from the Dockerfile] -> the
  discovery script and the declaration live in the same file and the invariant
  test asserts both, so a mismatch fails CI.
- [A turn's Gradle build needs network for dependencies] -> turns already have
  network for the model provider and dependency fetches; the image only removes
  the toolchain-download step.

## Migration Plan

1. Land the Dockerfile, workflow, docs, and test changes on a pull request; the
   PR build proves the native-only path and pushes nothing.
2. On the default branch, the next push publishes
   `ghcr.io/wuan/simple-orchestrator/android:latest` for `linux/amd64`, and
   republishes `node` and `rust` unchanged for both platforms.
3. Point an Android repository's `environment.image` at the new tag and add a
   Gradle cache volume; no orchestrator change is involved.
4. Rollback removes the `android` stage and the platform declaration and
   restores the global platform selection; the next default-branch push
   republishes the previous index.

## Open Questions

None. The JDK, SDK platform, and build-tools versions are pinned in the
Dockerfile as build args and can be raised later without changing the specs, the
approach, or the task breakdown.
