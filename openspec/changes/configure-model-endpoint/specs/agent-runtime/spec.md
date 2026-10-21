# Spec Delta

## MODIFIED Requirements

### Requirement: Configured embedded host
The embedded OpenCode host SHALL run every turn's session on a configured model and, when a database is configured, SHALL use that database for provider authentication and model definitions. The host SHALL apply a configured provider API endpoint and a configured provider API-key environment variable to the provider the model names, and SHALL fall back to the provider's built-in endpoint and credential variable when neither is configured.

#### Scenario: Configured model is used
- **WHEN** an agent model is configured
- **THEN** every turn's session runs on that model

#### Scenario: Provider authentication is reused
- **WHEN** an OpenCode database is configured
- **THEN** the embedded host uses it for provider auth and model definitions

#### Scenario: Configured endpoint is applied
- **WHEN** a provider API endpoint is configured
- **THEN** the embedded host sends the model's requests to that endpoint instead of the provider's built-in one

#### Scenario: Configured credential variable is applied
- **WHEN** a provider API-key environment variable is configured
- **THEN** the embedded host reads the provider API key from that variable instead of the provider's built-in one

#### Scenario: Provider defaults apply when unconfigured
- **WHEN** neither an endpoint nor an API-key variable is configured
- **THEN** the embedded host uses the provider's built-in endpoint and credential variable

### Requirement: Provider credentials cross by environment
The orchestrator SHALL pass configured environment variables into the container, SHALL pass the configured provider API-key variable into the container even when the environment does not name it, and MUST NOT bake provider credentials into an image or share an OpenCode database with the container.

#### Scenario: Provider auth passed through
- **WHEN** an environment names a provider variable
- **THEN** the container receives that variable's value from the orchestrator's environment

#### Scenario: Configured provider variable crosses by default
- **WHEN** a containerized turn runs and a provider API-key variable is configured
- **THEN** the container receives that variable's value from the orchestrator's environment without the environment naming it

#### Scenario: No secret is stored in the image
- **WHEN** a containerized turn runs
- **THEN** provider credentials are supplied at run time rather than baked into the image

### Requirement: Containerized turn execution
The orchestrator SHALL run a turn's agent work inside a container of the repository's configured environment image when one is configured, executing the OpenCode loop, the agent's shell and file tools, `git`, and `openspec` there, and SHALL return the same structured result as the in-process adapter. The in-container host SHALL apply the configured provider API endpoint and provider API-key variable.

#### Scenario: Configured image runs the turn
- **WHEN** a repository configures an environment image and a turn runs
- **THEN** the agent's commands and file operations execute inside a container of that image

#### Scenario: Structured result is preserved
- **WHEN** a containerized turn completes
- **THEN** the orchestrator receives the turn summary and usage through the same runtime result shape as an in-process turn

#### Scenario: In-process default retained
- **WHEN** a repository configures no environment
- **THEN** the turn runs in the in-process embedded host as before

#### Scenario: Configured provider reaches the container turn
- **WHEN** a containerized turn runs with a configured provider endpoint and API-key variable
- **THEN** the in-container host targets the configured endpoint and reads the token from the configured variable
