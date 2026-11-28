# Spec Delta

## ADDED Requirements

### Requirement: Device entries can describe their hardware

The orchestrator SHALL accept each `environment.devices` entry either as an
absolute host path or as an object with a `path` and an optional non-empty
`description`, so an operator can attach a short hardware hint to the exposure.
Both forms SHALL merge through `defaults` like the other environment fields, and
a bare path SHALL remain valid.

#### Scenario: Bare path is still accepted

- **WHEN** an environment lists a device as an absolute path string
- **THEN** the path is exposed to the turn exactly as before

#### Scenario: Entry carries a description

- **WHEN** an environment lists a device as an object with a path and a description
- **THEN** the path is exposed to the turn and the description is available to the turn's hardware advertisement

#### Scenario: Description is optional

- **WHEN** an environment lists a device as an object with a path and no description
- **THEN** the path is exposed to the turn and the advertisement falls back to the detected identity

#### Scenario: Device entries merge through defaults

- **WHEN** `defaults` configures device entries and a repository entry configures its own
- **THEN** the repository's device list is taken wholesale, as for every other array field

## MODIFIED Requirements

### Requirement: Invalid device configuration fails startup

The orchestrator SHALL validate the device fields at startup and SHALL stop with
an error naming the affected repository when a device path is empty or not
absolute, a group is empty, or a device field has the wrong type.

#### Scenario: Invalid device path fails startup

- **WHEN** an environment lists an empty or relative device path
- **THEN** startup fails with an error naming the repository

#### Scenario: Empty group fails startup

- **WHEN** an environment lists an empty group
- **THEN** startup fails with an error naming the repository

#### Scenario: Wrongly typed device field fails startup

- **WHEN** a device field is not a list of the expected values
- **THEN** startup fails with an error naming the repository

#### Scenario: Malformed device description fails startup

- **WHEN** a device entry has an empty or non-string description, or an object without a path
- **THEN** startup fails with an error naming the repository
