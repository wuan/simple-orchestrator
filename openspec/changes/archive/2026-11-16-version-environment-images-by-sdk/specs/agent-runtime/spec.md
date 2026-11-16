# Spec Delta

## ADDED Requirements

### Requirement: Environment image reference follows the orchestrator's SDK version

The orchestrator SHALL resolve an `environment.image` reference that names no
tag to the image's `sdk-<version>` tag using its own resolved `@opencode/sdk`
version, and SHALL use a reference that already names a tag or digest verbatim,
before starting a container turn.

#### Scenario: Untagged image selects the SDK tag

- **WHEN** a repository configures `ghcr.io/wuan/simple-orchestrator/rust` without a tag and the orchestrator resolves `@opencode/sdk` version `2.2.7`
- **THEN** the turn's container runs the image `ghcr.io/wuan/simple-orchestrator/rust:sdk-2.2.7`

#### Scenario: Tagged image is used verbatim

- **WHEN** a repository configures an image with an explicit tag, such as `ghcr.io/acme/agent-java:latest`
- **THEN** the orchestrator runs exactly that tagged reference and does not replace the tag

#### Scenario: Digest reference is used verbatim

- **WHEN** a repository configures an image by digest
- **THEN** the orchestrator runs exactly that digest reference

#### Scenario: A registry port is not mistaken for a tag

- **WHEN** a repository configures `localhost:5000/agent` without a tag
- **THEN** the orchestrator resolves `localhost:5000/agent:sdk-<version>` rather than treating `5000` as a tag

### Requirement: Container turns reject an SDK mismatch

The orchestrator SHALL fail a container turn with a clear error naming both
versions when the container reports an `@opencode/sdk` version different from
the orchestrator's, so an image built for another orchestrator version cannot
silently run a turn.

#### Scenario: Mismatched image fails the turn

- **WHEN** a container reports SDK version `2.2.5` and the orchestrator resolves `2.0.32`
- **THEN** the turn fails with an error naming both versions and directing the operator to rebuild or re-pin the environment image

#### Scenario: Matching image runs the turn

- **WHEN** the container reports the same SDK version the orchestrator resolves
- **THEN** the turn proceeds and its result is accepted
