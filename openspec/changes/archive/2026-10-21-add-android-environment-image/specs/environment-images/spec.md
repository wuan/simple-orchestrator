# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
