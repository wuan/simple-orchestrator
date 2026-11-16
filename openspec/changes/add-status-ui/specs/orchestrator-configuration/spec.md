# Spec Delta

## ADDED Requirements

### Requirement: Configurable status UI

The orchestrator SHALL accept an optional top-level `status` block with
`enabled`, `host`, and `port`, apply documented defaults when a field is
omitted, and stop with a clear error when a field is invalid.

#### Scenario: Defaults apply

- **WHEN** the configuration omits the `status` block
- **THEN** the status UI is disabled, binds to `127.0.0.1`, and uses the
  documented default port `8787`

#### Scenario: Enabled status UI is served

- **WHEN** the configuration enables the status UI
- **THEN** the running service serves the read-only status overview

#### Scenario: Overrides apply

- **WHEN** the configuration sets the status `host` and `port`
- **THEN** the listener binds to those values instead of the defaults

#### Scenario: Invalid status fields fail startup

- **WHEN** a status field has the wrong type, the host is empty, or the port is
  not a valid TCP port
- **THEN** startup stops with a clear error instead of starting a partially
  configured listener
