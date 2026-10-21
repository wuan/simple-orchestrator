# Spec Delta

## ADDED Requirements

### Requirement: Environment image is refreshed before each turn

The orchestrator SHALL refresh a containerized turn's environment image before
starting its container according to the environment's pull policy, so a mutable
tag such as `latest` runs the image that tag currently names rather than a stale
local copy. An image reference that encodes a digest SHALL be treated as
immutable and MUST NOT be re-checked against the registry.

#### Scenario: A mutable tag picks up a published image

- **WHEN** an environment's image uses a mutable tag and a newer image was published for it
- **THEN** the next turn starts in the newer image without a manual pull

#### Scenario: The default policy checks the registry

- **WHEN** an environment sets no pull policy
- **THEN** the orchestrator applies the documented default policy, which checks the registry for the image before starting the turn

#### Scenario: A non-refreshing policy is honoured

- **WHEN** an environment sets its pull policy to a non-refreshing value
- **THEN** the orchestrator starts the turn from the local image without checking the registry

#### Scenario: A digest-pinned image is not re-checked

- **WHEN** the image reference encodes a digest
- **THEN** the orchestrator does not contact the registry to look for an update

#### Scenario: A failed refresh fails the turn

- **WHEN** the image cannot be refreshed and the policy requires a check
- **THEN** the turn fails with a clear error instead of silently running the cached image
