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
The orchestrator SHALL accept an optional `environment` block on a repository entry and in `defaults`, naming a container image and optional network mode, image pull policy, environment variable names, git identity, and cache volumes, and SHALL apply documented defaults when optional fields are omitted. A container image reference that names no tag SHALL select the image for the orchestrator's `@opencode/sdk` version.

#### Scenario: Environment image is used
- **WHEN** a repository entry configures an environment image
- **THEN** turns for that repository run in a container of that image

#### Scenario: Untagged image follows the orchestrator's SDK version
- **WHEN** a repository entry configures `ghcr.io/wuan/simple-orchestrator/rust` without a tag
- **THEN** its turns run the image tagged for the orchestrator's resolved `@opencode/sdk` version

#### Scenario: Explicit image tag is honored
- **WHEN** a repository entry configures an environment image with a tag
- **THEN** the orchestrator runs that tagged image rather than deriving a tag

#### Scenario: Entry inherits an environment default
- **WHEN** `defaults` sets an environment image and a repository entry omits it
- **THEN** that entry inherits the default image

#### Scenario: Entry overrides an environment default
- **WHEN** `defaults` sets an environment image and a repository entry sets a different image
- **THEN** that entry uses its own image

#### Scenario: Default image pull policy applies
- **WHEN** neither `defaults` nor a repository entry sets an image pull policy
- **THEN** the documented default policy applies, checking the registry for the image before a turn

#### Scenario: Entry overrides an environment pull policy
- **WHEN** `defaults` sets an image pull policy and a repository entry sets a different one
- **THEN** that entry uses its own policy

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

#### Scenario: An unsupported pull policy fails startup
- **WHEN** the environment's pull policy is not one of the documented values
- **THEN** startup fails with an error naming the repository

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

#### Scenario: A non-loopback host is accepted

- **WHEN** the configuration sets the status `host` to a non-loopback address
- **THEN** the configuration loads and the listener binds to that address

#### Scenario: Invalid status fields fail startup

- **WHEN** a status field has the wrong type, the host is empty, or the port is
  not a valid TCP port
- **THEN** startup stops with a clear error instead of starting a partially
  configured listener

### Requirement: Environment device access is configurable

The orchestrator SHALL accept an optional `devices` field in a repository's
`environment` block and in `defaults`, listing absolute host device paths, and
an optional `groups` field naming supplementary groups. Omitted fields SHALL
mean no device access. Entries SHALL inherit or override each field from
`defaults` like the other environment fields, with an array taken wholesale from
the layer that sets it.

#### Scenario: Configured devices are exposed

- **WHEN** a repository's environment lists host device paths
- **THEN** its turns can open those paths inside the container

#### Scenario: Configured groups are joined

- **WHEN** a repository's environment lists supplementary groups
- **THEN** its container process runs with those groups, including when the turn runs as the orchestrator's non-root uid/gid

#### Scenario: Omitted fields keep the container isolated

- **WHEN** a repository's environment configures no device fields
- **THEN** its container sees only the runtime's default device set

#### Scenario: Device fields merge through defaults

- **WHEN** `defaults` configures device fields and a repository entry configures some of them differently
- **THEN** each field is inherited or overridden independently, like the other environment fields

### Requirement: Device entries can describe their hardware

The orchestrator SHALL accept each `environment.devices` entry either as an
absolute host path or as an object with a `path` and an optional non-empty
`description`, so an operator can attach a short hardware hint to the exposure.
Both forms SHALL merge through `defaults` like the other environment fields, and
a bare path SHALL remain valid.

#### Scenario: Bare path is still accepted

- **WHEN** an environment lists a device as an absolute path string
- **THEN** the path is exposed to the turn exactly as before

#### Scenario: Entry carries a description

- **WHEN** an environment lists a device as an object with a path and a description
- **THEN** the path is exposed to the turn and the description is available to the turn's hardware advertisement

#### Scenario: Description is optional

- **WHEN** an environment lists a device as an object with a path and no description
- **THEN** the path is exposed to the turn and the advertisement falls back to the detected identity

#### Scenario: Device entries merge through defaults

- **WHEN** `defaults` configures device entries and a repository entry configures its own
- **THEN** the repository's device list is taken wholesale, as for every other array field

### Requirement: Invalid device configuration fails startup

The orchestrator SHALL validate the device fields at startup and SHALL stop with
an error naming the affected repository when a device path is empty or not
absolute, a group is empty, or a device field has the wrong type.

#### Scenario: Invalid device path fails startup

- **WHEN** an environment lists an empty or relative device path
- **THEN** startup fails with an error naming the repository

#### Scenario: Empty group fails startup

- **WHEN** an environment lists an empty group
- **THEN** startup fails with an error naming the repository

#### Scenario: Wrongly typed device field fails startup

- **WHEN** a device field is not a list of the expected values
- **THEN** startup fails with an error naming the repository

#### Scenario: Malformed device description fails startup

- **WHEN** a device entry has an empty or non-string description, or an object without a path
- **THEN** startup fails with an error naming the repository
