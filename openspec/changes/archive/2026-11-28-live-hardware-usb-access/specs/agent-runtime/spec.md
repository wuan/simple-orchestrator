# Spec Delta

## ADDED Requirements

### Requirement: Container turns can open configured host devices

When an environment configures devices, the orchestrator SHALL check each host
path when a turn starts, expose it at the same path inside the container, and
run the container process with the configured supplementary groups, so the turn
can open it as the orchestrator's uid/gid. An environment with no device fields
SHALL keep the container's default isolated device set.

#### Scenario: Device is openable by the turn

- **WHEN** a containerized turn runs in an environment that configures a device path
- **THEN** the turn can open that path inside the container as its configured user

#### Scenario: Supplementary groups are applied

- **WHEN** an environment configures a group that owns a device
- **THEN** the container process joins that group, so the non-root turn can open the device

#### Scenario: Replugged device is followed between turns

- **WHEN** a configured stable device name points to a device that was replugged between two turns
- **THEN** the next turn resolves the name to the device's current target

#### Scenario: Missing device fails the turn

- **WHEN** a configured device path is absent or dangling when the turn starts
- **THEN** the turn fails with an error naming the path rather than starting without it

#### Scenario: Non-device path fails the turn

- **WHEN** a configured path exists but is not a character device
- **THEN** the turn fails with an error naming the path rather than starting with an unusable mapping

#### Scenario: No device fields keep the container isolated

- **WHEN** a containerized turn runs in an environment with no device fields
- **THEN** the container sees only the runtime's default device set
