# Spec Delta

## MODIFIED Requirements

### Requirement: Provider-agnostic interface
The orchestrator SHALL interact with source hosts only through a provider interface exposing issue, comment, label, pull request (or merge request), review-state, and clone operations, so hosts can be added or replaced without changes to core orchestration. The interface SHALL also expose a fetch operation that refreshes an existing clone.

#### Scenario: Core has no host-specific branches
- **WHEN** the orchestrator performs host operations
- **THEN** it does so through the provider interface rather than calling a host API directly

#### Scenario: A second provider is added
- **WHEN** a new host provider is implemented against the interface
- **THEN** orchestration behavior is unchanged

#### Scenario: An existing clone is refreshed
- **WHEN** the repository store needs the latest refs for a repository
- **THEN** the provider fetches them into the existing clone using the same credentials it uses to clone
