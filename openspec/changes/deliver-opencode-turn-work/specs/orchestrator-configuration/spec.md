# Spec Delta

## ADDED Requirements

### Requirement: Configurable agent runtime
The orchestrator SHALL let the operator configure the OpenCode model, agent, and database the embedded runtime uses, and SHALL apply a documented default model when the model is omitted.

#### Scenario: Default model applies
- **WHEN** a configuration omits the agent block
- **THEN** the embedded runtime runs turns on the documented default model

#### Scenario: Agent overrides apply
- **WHEN** a configuration sets the agent model, agent, or database
- **THEN** the embedded runtime uses those values for its turns
