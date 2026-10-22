# environment-images Specification

## Purpose
Defines the deployment of the turn environment images: which images the project
publishes to the GitHub Container Registry, for which platforms, how their
flavour set is determined, and how they stay version-matched with the
orchestrator that mounts the turn runner into them.

## Requirements

### Requirement: Environment images are published for every supported platform

The project SHALL publish each turn environment flavour to the GitHub Container
Registry as an image whose entries are exactly the platforms that flavour's
toolchain supports, so a host pulls a native image and the index carries no
unsupported or unknown entry.

#### Scenario: An amd64 host pulls a native image

- **WHEN** a host on `linux/amd64` pulls a published flavour
- **THEN** the registry serves an amd64 image and the container runs without emulation

#### Scenario: An arm64 host pulls a native image

- **WHEN** a host on `linux/arm64` pulls a flavour whose toolchain supports arm64
- **THEN** the registry serves an arm64 image and the container runs without emulation

#### Scenario: One tag covers both platforms

- **WHEN** a published tag of a dual-platform flavour's manifest is inspected
- **THEN** it is an image index that lists both `linux/amd64` and `linux/arm64`

#### Scenario: A single-platform flavour publishes only that platform

- **WHEN** the published `android` flavour's manifest is inspected
- **THEN** it is a `linux/amd64` image, because Google publishes the Linux Android SDK tools for `x86_64` only

#### Scenario: The index lists only the supported platforms

- **WHEN** a published tag's index is inspected
- **THEN** every entry names a platform the flavour supports and none reports an unknown operating system or architecture

### Requirement: The published flavour set follows the Dockerfile

The set of published images SHALL equal the flavour stages defined in
`environments/Dockerfile`, and the platforms each flavour is published for SHALL
be derived from the same file, so adding a flavour or restricting one to some
platforms needs no workflow edit and the two cannot drift apart.

#### Scenario: A new flavour is published automatically

- **WHEN** a `FROM base AS <name>` stage is added to the Dockerfile and the change lands on the default branch
- **THEN** an image for `<name>` is built and published without editing the workflow

#### Scenario: A flavour's platforms come from the Dockerfile

- **WHEN** a flavour stage names the platforms it supports and the workflow runs
- **THEN** that flavour is built and published for exactly those platforms without editing the workflow

#### Scenario: The workflow and the Dockerfile agree

- **WHEN** the workflow runs
- **THEN** it builds exactly the flavours the Dockerfile defines and fails when it finds none

### Requirement: Published images keep the orchestrator's SDK version

Every published image SHALL install `@opencode/sdk` at the version the
orchestrator resolves in `package-lock.json`, and a build without that version
SHALL fail rather than bake a stale default, so a published image cannot drift
from the orchestrator.

#### Scenario: The lockfile version is built in

- **WHEN** the workflow builds a flavour
- **THEN** it passes the `@opencode/sdk` version from `package-lock.json` and the image installs exactly that version

#### Scenario: A missing version fails the build

- **WHEN** the build runs without an SDK version
- **THEN** the build fails with a clear message instead of publishing an image with a guessed SDK

### Requirement: Pull requests build but do not publish

A pull request that changes an environment input SHALL build the images on the
CI runner's native platform only, without pushing to the registry, so
verification stays fast, and pushes to the default branch and version tags SHALL
build and publish every supported platform, tagging the default branch `latest`
and version tags with their semantic versions.

#### Scenario: A pull request does not publish

- **WHEN** a pull request changes an environment image input
- **THEN** the images build and the workflow pushes nothing to the registry

#### Scenario: A pull request builds only the native platform

- **WHEN** a pull request builds the environment images
- **THEN** the build covers the runner's native `linux/amd64` platform and does not emulate arm64

#### Scenario: The default branch publishes the latest images

- **WHEN** a change lands on the default branch
- **THEN** each flavour is published and tagged `latest`

#### Scenario: A version tag publishes semantic versions

- **WHEN** a `v*` tag is pushed
- **THEN** each flavour is published with its semantic-version tags

### Requirement: The supported platforms are documented

The project documentation SHALL name the published image location and the
platforms it covers, and SHALL state that the host's container runtime selects
the image matching its own architecture.

#### Scenario: An operator can find the images and their platforms

- **WHEN** the environment image documentation is read
- **THEN** it names the `ghcr.io` location, the published platforms, and how a host picks the matching image

### Requirement: The Rust flavour provides the native build dependencies Rust turns need

The `rust` turn environment flavour SHALL install the native development packages a Rust repository's dependency tree needs, including the OpenSSL development headers and library (`libssl-dev`), so a crate that links the system OpenSSL, directly or transitively, compiles inside a turn instead of failing on a missing header.

#### Scenario: A crate that links system OpenSSL builds

- **WHEN** a Rust turn builds a dependency tree that links the system OpenSSL, for example through `native-tls` or `postgres-native-tls`
- **THEN** the `rust` image provides the OpenSSL development headers and library and the build succeeds without installing extra packages

#### Scenario: The extra package stays in the Rust flavour

- **WHEN** a flavour other than `rust` is built
- **THEN** it does not carry the OpenSSL development package, so the shared contract and the `node` flavour are unchanged

### Requirement: Provenance and SBOM are published as attestations outside the image index

The project SHALL attach a signed provenance attestation and a signed SBOM
attestation to every published image, stored outside the image index (for
example in the registry's attestation storage, keyed to the image digest), so
the supply-chain metadata is retained without adding an attestation manifest to
the index. A pull request, which publishes nothing, SHALL produce no
attestation.

#### Scenario: A published image carries a verifiable provenance attestation

- **WHEN** a published image is verified
- **THEN** a signed provenance attestation resolves for the published index digest

#### Scenario: A published image carries a verifiable SBOM attestation

- **WHEN** a published image is verified
- **THEN** a signed SBOM attestation resolves for the published index digest

#### Scenario: Attestations do not appear as image platforms

- **WHEN** a published tag's index is inspected
- **THEN** it contains exactly the flavour's supported platform manifests and no attestation manifest

#### Scenario: A pull request does not attest

- **WHEN** a pull request builds the images
- **THEN** the workflow runs no attestation step

### Requirement: The Android flavour provides an Android SDK toolchain

The `android` turn environment flavour SHALL install a JDK, the Android SDK command-line tools, and the SDK platform, build tools, and platform tools a Gradle Android build needs, SHALL accept the Android SDK licences, and SHALL expose the SDK through the environment variables such a build reads, so an Android repository builds in a turn without installing a toolchain.

#### Scenario: A Gradle Android build runs in a turn

- **WHEN** an Android turn runs the repository's Gradle wrapper to build an Android app
- **THEN** the build finds the JDK, an accepted SDK licence, and the SDK platform and build tools it declares, and succeeds without installing a toolchain

#### Scenario: An unprivileged turn can use the SDK

- **WHEN** the turn runs as the orchestrator's uid/gid
- **THEN** the installed JDK and Android SDK are readable and executable and the SDK directory is writable, so Gradle can install the components a project resolves

#### Scenario: The Android toolchain stays in the Android flavour

- **WHEN** a flavour other than `android` is built
- **THEN** it does not carry the JDK or the Android SDK, so the shared contract and the other flavours are unchanged

### Requirement: The PlatformIO flavour provides PlatformIO Core

The `platformio` turn environment flavour SHALL install PlatformIO Core, so a
`pio` build or test runs in a turn without installing a toolchain, and SHALL
expose PlatformIO's core directory at a stable path, so a mounted cache volume
keeps the platforms, toolchains, and libraries `pio` downloads between turns.

#### Scenario: A firmware build runs in a turn

- **WHEN** a PlatformIO turn runs the repository's `pio run` for a board
- **THEN** the build finds PlatformIO Core, resolves the platform and toolchain its `platformio.ini` declares, and builds the firmware without installing PlatformIO

#### Scenario: A downloaded platform is reused across turns

- **WHEN** a turn downloads a platform, toolchain, or library and the repository mounts a cache volume at PlatformIO's core directory
- **THEN** a later turn reuses the download instead of fetching it again

#### Scenario: An unprivileged turn can run PlatformIO

- **WHEN** the turn runs as the orchestrator's uid/gid
- **THEN** PlatformIO Core is readable and executable and the core directory is writable

#### Scenario: The PlatformIO flavour publishes both supported platforms

- **WHEN** the `platformio` flavour is published
- **THEN** it carries a `linux/amd64` and a `linux/arm64` image, because PlatformIO publishes the `espressif32` tool packages for `aarch64` and `x86_64`

#### Scenario: The PlatformIO toolchain stays in the PlatformIO flavour

- **WHEN** a flavour other than `platformio` is built
- **THEN** it does not carry PlatformIO Core or its extra tools, so the shared contract and the other flavours are unchanged

### Requirement: The PlatformIO flavour provides the repository's test and gate tools

The `platformio` turn environment flavour SHALL install the coverage tooling an
embedded repository's test report uses and the pinned formatting and lint tools
its commit gate expects, so a turn runs those checks before it commits without
installing them.

#### Scenario: The native tests build and run

- **WHEN** a PlatformIO turn runs the repository's `pio test -e native`
- **THEN** the tests compile with the shared base's host C/C++ compiler and run, and the coverage report the repository generates resolves the coverage tooling the image provides

#### Scenario: The formatting and lint checks run

- **WHEN** a PlatformIO turn runs the repository's formatting and lint checks
- **THEN** the image provides the pinned `clang-format` and `shellcheck` the repository's gate expects, so the checks run without installing them
