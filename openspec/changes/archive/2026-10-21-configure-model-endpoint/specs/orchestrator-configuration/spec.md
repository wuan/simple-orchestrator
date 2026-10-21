# Spec Delta

## MODIFIED Requirements

### Requirement: Configurable agent runtime

The orchestrator SHALL let the operator configure the OpenCode model, agent,
database, provider API endpoint, and provider API-key environment variable the
embedded runtime uses - naming the last two `agent.apiEndpoint` and
`agent.apiKeyEnv` - and SHALL apply a documented default model and a documented
default API-key variable when they are omitted.

#### Scenario: Default model applies

- **WHEN** a configuration omits the agent block
- **THEN** the embedded runtime runs turns on the documented default model

#### Scenario: Agent overrides apply

- **WHEN** a configuration sets the agent model, agent, or database
- **THEN** the embedded runtime uses those values for its turns

#### Scenario: Configured endpoint applies

- **WHEN** a configuration sets `agent.apiEndpoint`
- **THEN** the embedded runtime targets that API base URL for the provider the model names

#### Scenario: Default API-key variable is generic

- **WHEN** a configuration omits the agent API-key variable
- **THEN** the embedded runtime reads the provider API key from the documented generic variable rather than a vendor-named one

#### Scenario: API-key variable is configurable

- **WHEN** a configuration names a provider API-key environment variable
- **THEN** the embedded runtime reads the provider API key from that variable

#### Scenario: Invalid agent fields fail startup

- **WHEN** `agent.apiEndpoint` or `agent.apiKeyEnv` is not a non-empty string
- **THEN** startup stops with a clear error instead of running with a partially applied agent configuration
