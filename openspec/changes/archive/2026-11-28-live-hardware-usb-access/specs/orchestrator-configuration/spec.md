# Spec Delta

## ADDED Requirements

### Requirement: Environment device access is configurable

The orchestrator SHALL accept an optional `devices` field in a repository's
`environment` block and in `defaults`, listing absolute host device paths, and
an optional `groups` field naming supplementary groups. Omitted fields SHALL
mean no device access. Entries SHALL inherit or override each field from
`defaults` like the other environment fields, with an array taken wholesale from
the layer that sets it.

#### Scenario: Configured devices are exposed

- **WHEN** a repository's environment lists host device paths
- **THEN** its turns can open those paths inside the container

#### Scenario: Configured groups are joined

- **WHEN** a repository's environment lists supplementary groups
- **THEN** its container process runs with those groups, including when the turn runs as the orchestrator's non-root uid/gid

#### Scenario: Omitted fields keep the container isolated

- **WHEN** a repository's environment configures no device fields
- **THEN** its container sees only the runtime's default device set

#### Scenario: Device fields merge through defaults

- **WHEN** `defaults` configures device fields and a repository entry configures some of them differently
- **THEN** each field is inherited or overridden independently, like the other environment fields

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
