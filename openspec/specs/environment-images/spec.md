# environment-images Specification

## Purpose
Defines the deployment of the turn environment images: which images the project
publishes to the GitHub Container Registry, for which platforms, how their
flavour set is determined, and how they stay version-matched with the
orchestrator that mounts the turn runner into them.

## Requirements

### Requirement: Environment images are published for every supported platform

The project SHALL publish each turn environment flavour to the GitHub Container
Registry as a multi-platform image covering `linux/amd64` and `linux/arm64`, in
a single build, so a host on either platform pulls an image that runs natively.

#### Scenario: An amd64 host pulls a native image

- **WHEN** a host on `linux/amd64` pulls a published flavour
- **THEN** the registry serves an amd64 image and the container runs without emulation

#### Scenario: An arm64 host pulls a native image

- **WHEN** a host on `linux/arm64` pulls a published flavour
- **THEN** the registry serves an arm64 image and the container runs without emulation

#### Scenario: One tag covers both platforms

- **WHEN** a published tag's manifest is inspected
- **THEN** it is an image index that lists both `linux/amd64` and `linux/arm64`

### Requirement: The published flavour set follows the Dockerfile

The set of published images SHALL equal the flavour stages defined in
`environments/Dockerfile`, so adding a flavour publishes it without editing the
workflow and the two cannot drift apart.

#### Scenario: A new flavour is published automatically

- **WHEN** a `FROM base AS <name>` stage is added to the Dockerfile and the change lands on the default branch
- **THEN** an image for `<name>` is built and published without editing the workflow

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

A pull request that changes an environment input SHALL build the images to
validate them without pushing to the registry, and pushes to the default branch
and version tags SHALL publish, tagging the default branch `latest` and version
tags with their semantic versions.

#### Scenario: A pull request does not publish

- **WHEN** a pull request changes an environment image input
- **THEN** the images build and the workflow pushes nothing to the registry

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
