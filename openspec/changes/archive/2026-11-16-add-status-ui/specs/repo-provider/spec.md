# Spec Delta

## ADDED Requirements

### Requirement: Normalized entities carry their web URL

The provider issue and pull request models SHALL carry the host's web URL for the
issue or pull request, so a consumer can link to it without host-specific code.

#### Scenario: An issue is mapped with its URL

- **WHEN** a provider maps an issue whose host exposes a web URL
- **THEN** the normalized issue carries that URL

#### Scenario: A pull request is mapped with its URL

- **WHEN** a provider maps a pull request whose host exposes a web URL
- **THEN** the normalized pull request carries that URL

#### Scenario: A host without a URL omits the field

- **WHEN** a provider cannot supply a web URL for an issue or pull request
- **THEN** the field is absent and consumers still handle the entity
