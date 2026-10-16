# Spec Delta

## ADDED Requirements

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
