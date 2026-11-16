# Spec Delta

## MODIFIED Requirements

### Requirement: Objective readiness predicate
The orchestrator SHALL mark a change READY only when the OpenSpec change is complete and passes strict validation, computed from the OpenSpec CLI rather than from agent output. An artifact that OpenSpec reports as `skipped` SHALL count as satisfied.

#### Scenario: Change becomes ready
- **WHEN** every artifact of the change is `done` or `skipped` and `openspec validate --strict` passes
- **THEN** the orchestrator sets the change to READY and prompts for approval

#### Scenario: Change declares no spec delta
- **WHEN** a change sets `skip_specs: true`, `openspec status` reports its `specs` artifact as `skipped`, every other artifact is `done`, and `openspec validate --strict` passes
- **THEN** the orchestrator sets the change to READY and prompts for approval

#### Scenario: Unfinished artifact blocks readiness
- **WHEN** an artifact reports a state other than `done` or `skipped`, such as `ready` or `missing`
- **THEN** the orchestrator keeps the change in PROPOSING

#### Scenario: Agent claims readiness prematurely
- **WHEN** an agent reports the change is ready but the readiness predicate does not pass
- **THEN** the orchestrator keeps the change in PROPOSING
