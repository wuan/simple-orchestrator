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

### Requirement: Images are tagged with the SDK version they install

Every published environment image SHALL carry an SDK-version tag
(`sdk-<version>`) naming the `@opencode/sdk` version baked into it, alongside
its existing tags, so an orchestrator can pull an image by the compatibility
contract it checks at turn start.

#### Scenario: An image build publishes its SDK tag

- **WHEN** the workflow builds a flavour with `@opencode/sdk` version `X`
- **THEN** it publishes that flavour under `sdk-X`, in addition to `latest` and its commit tags

#### Scenario: The SDK tag names the installed version

- **WHEN** an image pulled by its `sdk-X` tag reports its installed SDK version
- **THEN** the reported version is `X`

#### Scenario: Pull requests do not publish SDK tags

- **WHEN** a pull request builds an environment image
- **THEN** no `sdk-*` tag is pushed to the registry

### Requirement: Documentation pairs images with an SDK version

The environment image documentation SHALL present the SDK-version tag (or an
untagged reference the orchestrator resolves to it) as the supported way to
pair an image with a checkout, and SHALL state that `latest` moves with the
default branch and can carry an SDK the running orchestrator does not have.

#### Scenario: The documented example pairs image and checkout

- **WHEN** an operator reads the image documentation's configuration example
- **THEN** it does not pin `latest`, and it explains how the image follows the orchestrator's SDK version

#### Scenario: The movable tag is called out

- **WHEN** an operator reads about `latest`
- **THEN** the documentation states that it follows the default branch and is not safe to pair with a checkout that may lag behind

### Requirement: The uv flavour provides uv and its cache paths

The `uv` turn environment flavour SHALL install a pinned `uv` binary, expose it on
`PATH` to an unprivileged turn, and define stable cache paths for the
interpreters, packages, and tools `uv` downloads, so a Python repository runs its
`uv` commands without installing `uv`.

#### Scenario: A Python turn runs uv commands

- **WHEN** a `uv` turn runs `uv sync` or `uv run` against the repository's `pyproject.toml` and `uv.lock`
- **THEN** the image provides `uv` and the command resolves the interpreter and dependencies without installing `uv`

#### Scenario: Downloaded interpreters and packages are reused

- **WHEN** a turn downloads a Python interpreter or package into the flavour's cache paths and the repository mounts a cache volume there
- **THEN** a later turn reuses the download instead of fetching it again

#### Scenario: An unprivileged turn can run uv

- **WHEN** the turn runs as the orchestrator's uid/gid
- **THEN** `uv` is readable and executable and the cache paths are writable

#### Scenario: The uv flavour publishes both supported platforms

- **WHEN** the `uv` flavour is published
- **THEN** it carries a `linux/amd64` and a `linux/arm64` image, because `uv` and the Python builds it installs support both platforms

#### Scenario: The Python toolchain stays in the uv flavour

- **WHEN** a flavour other than `uv` is built
- **THEN** it does not carry `uv`, so the shared contract and the `node`, `rust`, `android`, and `platformio` flavours are unchanged

### Requirement: The uv flavour leaves interpreters and project tooling to the repository

The `uv` turn environment flavour SHALL leave the Python version, dependencies,
and development tools to the repository's `pyproject.toml`, `uv.lock`, and `uv`
commands, so the image does not impose a version or toolchain on a Python
repository.

#### Scenario: The repository's Python version is resolved at turn time

- **WHEN** a repository declares its Python version through `requires-python` or `.python-version`
- **THEN** `uv` selects or downloads a matching interpreter instead of the image fixing one

#### Scenario: Project development tools come from the repository environment

- **WHEN** a turn runs the repository's tests, lint, type check, or commit hooks
- **THEN** it uses the tools and versions the repository declares, not preinstalled image versions

### Requirement: The PlatformIO flavour provides live-hardware USB tooling

The `platformio` turn environment flavour SHALL install USB inspection tooling
and the runtime libraries a HID client needs, so an unprivileged hardware turn
can list USB devices and open a meter's `hidraw` interface without installing
packages. The tooling SHALL stay in the `platformio` flavour.

#### Scenario: USB devices are inspectable in a turn

- **WHEN** a PlatformIO turn runs `lsusb`
- **THEN** the command runs from the image and lists the devices exposed to the container

#### Scenario: A HID client opens hidraw

- **WHEN** a PlatformIO turn runs a HID client against an exposed `hidraw` interface
- **THEN** the client's runtime libraries resolve from the image and the device opens

#### Scenario: Other flavours remain unchanged

- **WHEN** a flavour other than `platformio` is built
- **THEN** it does not carry the live-hardware USB tooling

### Requirement: The PlatformIO flavour runs repository scripts on Python 3.12

The `platformio` turn environment flavour SHALL run PlatformIO Core and the
repository's pre/post scripts on Python 3.12, so a repository whose scripts use
3.12 language features builds in a turn without installing an interpreter. The
shared base and every other flavour SHALL keep their current Python.

#### Scenario: A 3.12-only pre-script runs

- **WHEN** a PlatformIO turn builds a repository whose pre/post script uses 3.12 language features
- **THEN** the script runs on Python 3.12 and the build proceeds

#### Scenario: PlatformIO Core uses the same interpreter

- **WHEN** a PlatformIO turn runs `pio run`
- **THEN** PlatformIO Core runs on Python 3.12

#### Scenario: The Python runtime stays in the PlatformIO flavour

- **WHEN** a flavour other than `platformio` is built
- **THEN** it does not carry the Python 3.12 runtime

### Requirement: Live-hardware prerequisites are documented

The environment image documentation SHALL describe the host prerequisites for
passing live hardware into a turn: udev rules that set group ownership and stable
device names for the board and meter, keeping ModemManager off firmware CDC
ports, and the limitation that direct device access requires a Linux host while
Docker Desktop on macOS needs USB/IP.

#### Scenario: Operator finds the udev setup

- **WHEN** an operator wants to pass a board and a USB meter into a turn
- **THEN** the environment documentation names the required udev permissions, stable names, and CDC-port exclusion

#### Scenario: Unsupported host is called out

- **WHEN** an operator runs the orchestrator on macOS with Docker Desktop
- **THEN** the documentation states that direct device access is unavailable and names USB/IP as the alternative
