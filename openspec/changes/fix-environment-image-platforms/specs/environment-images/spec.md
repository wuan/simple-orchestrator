# Spec Delta

## MODIFIED Requirements

### Requirement: Environment images are published for every supported platform

The project SHALL publish each turn environment flavour to the GitHub Container
Registry as a single multi-platform image index whose entries are exactly
`linux/amd64` and `linux/arm64`, so a host on either platform pulls an image
that runs natively and the index carries no entry for an unsupported or unknown
platform.

#### Scenario: An amd64 host pulls a native image

- **WHEN** a host on `linux/amd64` pulls a published flavour
- **THEN** the registry serves an amd64 image and the container runs without emulation

#### Scenario: An arm64 host pulls a native image

- **WHEN** a host on `linux/arm64` pulls a published flavour
- **THEN** the registry serves an arm64 image and the container runs without emulation

#### Scenario: One tag covers both platforms

- **WHEN** a published tag's manifest is inspected
- **THEN** it is an image index that lists both `linux/amd64` and `linux/arm64`

#### Scenario: The index lists only the supported platforms

- **WHEN** a published tag's manifest is inspected
- **THEN** every entry names `linux/amd64` or `linux/arm64` and none reports an unknown operating system or architecture

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
