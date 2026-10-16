# Spec Delta

## Purpose

Lets a single operator declare which repositories the orchestrator serves and how it authenticates to each, without requiring a multi-tenant install flow.

## ADDED Requirements

### Requirement: Declarative repository configuration
The orchestrator SHALL be configured from a declarative list of repositories, each specifying a provider, a credential reference, and optional label overrides.

#### Scenario: Configured repositories are polled
- **WHEN** the orchestrator starts with a list of repositories
- **THEN** it polls each listed repository for new work

### Requirement: Credentials are external
The orchestrator MUST obtain credentials from the environment or an external secret source and MUST NOT require secrets to be committed to the repository.

#### Scenario: Credential is referenced, not inlined
- **WHEN** a repository entry needs authentication
- **THEN** it references a credential resolved at runtime rather than embedding the secret in configuration

### Requirement: Configurable labels and interval
Trigger and lifecycle label names and the poll interval SHALL be configurable, with documented defaults applied when they are omitted.

#### Scenario: Defaults apply
- **WHEN** a repository entry omits label overrides
- **THEN** the documented default labels are used

#### Scenario: Overrides apply
- **WHEN** a repository entry specifies a custom trigger label
- **THEN** that label is used for discovery on that repository

### Requirement: Fail-fast validation
The orchestrator SHALL validate its configuration at startup and SHALL stop with a clear error when a required entry is missing or invalid.

#### Scenario: Missing credential reference
- **WHEN** a repository entry lacks a required credential reference
- **THEN** startup fails with an error naming the affected repository

### Requirement: Single-tenant only
This version SHALL operate for a single operator with a shared configuration and SHALL NOT implement multi-tenant accounts or a host app-install flow.

#### Scenario: No user accounts required
- **WHEN** the orchestrator runs
- **THEN** it requires no per-user accounts beyond the configured credentials
