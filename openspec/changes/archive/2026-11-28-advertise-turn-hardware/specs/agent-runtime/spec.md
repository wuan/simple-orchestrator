# Spec Delta

## ADDED Requirements

### Requirement: Turn instruction advertises exposed hardware

When a containerized turn's environment exposes at least one device, the turn
instruction SHALL name each exposed device with its configured description and
any host identity the orchestrator detected, and SHALL NOT advertise a device the
environment does not expose. An environment with no devices SHALL leave the
instruction unchanged.

#### Scenario: Hardware turn names its devices

- **WHEN** a containerized turn runs in an environment that exposes device paths
- **THEN** its instruction names each exposed path

#### Scenario: Description and identity are included

- **WHEN** an exposed device has a configured description and the host reports its model or serial
- **THEN** the advertisement includes both the description and the detected identity

#### Scenario: Undetected hardware falls back to the description

- **WHEN** the host cannot report an exposed device's identity
- **THEN** the advertisement still names the path and its configured description, and the turn is not failed for the missing identity

#### Scenario: Unexposed hardware is not advertised

- **WHEN** the host has a device the environment does not list
- **THEN** the turn instruction does not mention it

#### Scenario: No devices leaves the instruction unchanged

- **WHEN** a containerized turn's environment exposes no devices
- **THEN** its instruction carries no hardware advertisement

### Requirement: Turn can read a hardware manifest

The orchestrator SHALL make a per-turn hardware manifest available to a
containerized turn at a stable path outside the git worktree, describing each
exposed device and its detected identity, so the agent can read full detail
without the instruction carrying it.

#### Scenario: Manifest is readable during the turn

- **WHEN** a containerized turn runs in an environment that exposes devices
- **THEN** the agent can read the hardware manifest at the path named in its instruction

#### Scenario: Manifest stays outside the worktree

- **WHEN** the agent reads the hardware manifest
- **THEN** the manifest is not part of the worktree, so it cannot be committed to the workflow branch

#### Scenario: Manifest describes this turn's devices

- **WHEN** two turns run in environments with different device lists
- **THEN** each turn's manifest describes only the devices that turn exposes
