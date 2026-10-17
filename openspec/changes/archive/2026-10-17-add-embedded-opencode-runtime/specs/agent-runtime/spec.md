# Spec Delta

## MODIFIED Requirements

### Requirement: OpenCode adapter
The system SHALL include a runtime adapter that runs the OpenSpec propose and apply skills through OpenCode, as the first supported runtime. The adapter SHALL host OpenCode in-process through the embedded OpenCode SDK, so it does not require an operator-managed OpenCode server.

#### Scenario: Skill runs via OpenCode
- **WHEN** a propose or apply turn runs with the OpenCode adapter configured
- **THEN** the skill is executed through the embedded OpenCode host and its result is returned to the orchestrator

#### Scenario: No external server is required
- **WHEN** the OpenCode adapter runs a turn
- **THEN** it creates and owns the OpenCode host itself, without connecting to a separately managed server

## ADDED Requirements

### Requirement: Runtime host lifecycle
The OpenCode adapter SHALL create at most one embedded host per service process, SHALL reuse it across turns, and SHALL release the host when the service stops so its resources are reclaimed.

#### Scenario: Host reused across turns
- **WHEN** the adapter runs a second turn
- **THEN** it reuses the host created for the first turn rather than creating another

#### Scenario: Host released on shutdown
- **WHEN** the service stops
- **THEN** the adapter closes the host it created and no host resources remain

#### Scenario: Host is not created until a turn runs
- **WHEN** the service starts and stops without running a turn
- **THEN** no embedded host is created
