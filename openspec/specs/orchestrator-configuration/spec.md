# orchestrator-configuration Specification

## Purpose
Lets a single operator declare which repositories the orchestrator serves and how it authenticates to each, without requiring a multi-tenant install flow.

## Requirements

### Requirement: Declarative repository configuration
The orchestrator SHALL be configured from a declarative list of repositories, each specifying a provider, a credential reference, and optional label overrides.

#### Scenario: Configured repositories are polled
- **WHEN** the orchestrator starts with a list of repositories
- **THEN** it polls each listed repository for new work

### Requirement: Credentials are external
The orchestrator MUST obtain credentials from an environment variable or an external secret source and MUST NOT require secrets to be committed to the repository.

#### Scenario: Credential is referenced, not inlined
- **WHEN** a repository entry needs authentication
- **THEN** it references a credential resolved at runtime rather than embedding the secret in configuration

### Requirement: GitHub credential fallback
The orchestrator SHALL support resolving GitHub credentials from the operator's authenticated GitHub CLI session, and SHALL fall back to that session when a referenced environment variable is unset.

#### Scenario: Credential resolved from the GitHub CLI
- **WHEN** a repository references a GitHub CLI credential, or references an environment variable that is unset
- **THEN** the orchestrator obtains the token from the operator's authenticated GitHub CLI session

#### Scenario: No credential source is available
- **WHEN** neither the referenced environment variable nor the GitHub CLI can provide a credential
- **THEN** startup fails fast with an error naming the affected repository

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

### Requirement: Configurable workspace locations

The orchestrator SHALL let the operator configure the root for persistent
repository clones and the parent directory for per-turn worktrees, and SHALL
apply documented defaults when either is omitted.

#### Scenario: Defaults apply

- **WHEN** a configuration omits the workspace settings
- **THEN** persistent clones are kept under `~/workspace` and per-turn worktrees under the OS temp directory

#### Scenario: Overrides apply

- **WHEN** a configuration specifies a workspace root and worktree directory
- **THEN** persistent clones and per-turn worktrees are created under those paths

### Requirement: Configurable logging verbosity
The orchestrator SHALL let the operator enable verbose logging through a command-line option and through the configuration file, and SHALL write concise output when neither is set.

#### Scenario: Default output is concise
- **WHEN** the service runs with neither the verbose option nor verbose configuration
- **THEN** it writes only the concise workflow summaries it produced before and omits per-poll-cycle and per-turn diagnostics

#### Scenario: Verbose enabled by the command-line option
- **WHEN** the service starts with the verbose option
- **THEN** it writes verbose diagnostics for every poll cycle even when the configuration does not enable them

#### Scenario: Verbose enabled by configuration
- **WHEN** the configuration enables verbose logging and the command-line option is absent
- **THEN** the service writes verbose diagnostics

### Requirement: Secrets are never logged
The orchestrator MUST NOT write credentials, tokens, or other secret values to its output at any verbosity, and SHALL redact a secret value from any diagnostic that would otherwise contain it.

#### Scenario: Verbose run does not reveal a credential
- **WHEN** verbose logging is enabled and a repository uses a credential
- **THEN** the credential value does not appear anywhere in the output

#### Scenario: A diagnostic containing a secret is redacted
- **WHEN** a diagnostic message would include a credential or token value
- **THEN** the value is replaced with a redaction marker before it is written

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

### Requirement: Shared repository defaults
The orchestrator SHALL accept an optional top-level `defaults` block whose fields supply values for repository entries that omit them, and SHALL merge each repository entry over those defaults before validation.

#### Scenario: Entry inherits a default
- **WHEN** the top-level `defaults` sets `provider` and `owner` and a repository entry omits them
- **THEN** that repository is configured with the default provider and owner

#### Scenario: Entry overrides a default
- **WHEN** `defaults` sets `baseBranch` to `develop` and one repository entry sets `baseBranch` to `main`
- **THEN** that repository uses `main` while the other entries use `develop`

#### Scenario: Labels merge key by key
- **WHEN** `defaults` sets `labels.trigger` and a repository entry sets `labels.ready`
- **THEN** that repository uses the default trigger, its own ready label, and the documented built-in defaults for every other label

#### Scenario: Built-in defaults still apply
- **WHEN** neither `defaults` nor a repository entry sets `pollIntervalSeconds`
- **THEN** the documented built-in poll interval applies

#### Scenario: Name is required per entry
- **WHEN** `defaults` is present and a repository entry omits `name`
- **THEN** startup fails with an error naming the offending entry

#### Scenario: Required field missing after the merge
- **WHEN** neither `defaults` nor a repository entry provides `credential`
- **THEN** startup fails with an error naming the affected repository

### Requirement: Configurable turn environment
The orchestrator SHALL accept an optional `environment` block on a repository entry and in `defaults`, naming a container image and optional network mode, environment variable names, git identity, and cache volumes, and SHALL apply documented defaults when optional fields are omitted.

#### Scenario: Environment image is used
- **WHEN** a repository entry configures an environment image
- **THEN** turns for that repository run in a container of that image

#### Scenario: Entry inherits an environment default
- **WHEN** `defaults` sets an environment image and a repository entry omits it
- **THEN** that entry inherits the default image

#### Scenario: Entry overrides an environment default
- **WHEN** `defaults` sets an environment image and a repository entry sets a different image
- **THEN** that entry uses its own image

#### Scenario: No environment keeps the in-process runtime
- **WHEN** neither `defaults` nor a repository entry sets an environment
- **THEN** that repository's turns run in the in-process runtime

### Requirement: Fail-fast environment validation
The orchestrator SHALL validate the environment block at startup and SHALL stop with a clear error naming the affected repository when its image is missing or a field is invalid.

#### Scenario: Missing image fails startup
- **WHEN** an environment block omits the image
- **THEN** startup fails with an error naming the repository

#### Scenario: Invalid field fails startup
- **WHEN** an environment field has the wrong type or an empty value
- **THEN** startup fails with an error naming the repository
