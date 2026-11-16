# Spec Delta

## Purpose

Gives an operator a single read-only overview of which issues and pull requests
the orchestrator is currently driving across the configured repositories.

## ADDED Requirements

### Requirement: Read-only status overview

The orchestrator SHALL expose a read-only status overview over HTTP that reports
the active work across every configured repository, and SHALL NOT create, update,
or delete any host resource while serving it.

#### Scenario: Overview covers every configured repository

- **WHEN** the status overview is requested
- **THEN** it reports an entry for every configured repository

#### Scenario: Serving the overview never writes to the host

- **WHEN** the status overview is served
- **THEN** no labels, comments, reviews, or pull requests are created, changed, or removed

#### Scenario: Mutating requests are refused

- **WHEN** a request other than `GET` or `HEAD` is made to the status server
- **THEN** it is refused and no host resource is touched

### Requirement: Status data is served as HTML and JSON

The orchestrator SHALL serve the overview as an HTML page at the root path and
as a machine-readable JSON document at `/status.json`, both derived from the same
snapshot.

#### Scenario: A browser receives the HTML overview

- **WHEN** a browser requests the root path
- **THEN** it receives an HTML page listing the active work per repository

#### Scenario: A client receives the JSON document

- **WHEN** a client requests `/status.json`
- **THEN** it receives the same overview as structured JSON

### Requirement: Active work is derived objectively from provider state

The status overview SHALL enumerate each repository's trigger-labeled issues and
their pull requests, derive each workflow's phase from the lifecycle labels, and
classify it without running a turn or consulting agent output.

#### Scenario: Labeled issue with no pull request is queued

- **WHEN** a trigger-labeled issue has no pull request yet
- **THEN** the overview reports it as queued rather than in flight

#### Scenario: In-flight workflow reports its phase

- **WHEN** a workflow pull request carries a lifecycle label
- **THEN** the overview reports the corresponding phase (`proposing`, `ready`,
  `implementing`, or `failed`)

#### Scenario: Terminal work is not reported as active

- **WHEN** a workflow's pull request has merged and reached the `done` phase
- **THEN** the overview does not report that workflow as active

#### Scenario: Unconfigured repositories are not read

- **WHEN** the overview is served
- **THEN** it reads only the configured repositories

### Requirement: Status listener is opt-in and loopback-bound by default

The status HTTP listener SHALL be disabled by default, SHALL bind to loopback
when enabled without an explicit host, SHALL bind to the configured host when
one is given (including a non-loopback address), and SHALL run only while the
service is polling.

#### Scenario: Disabled by default

- **WHEN** the status configuration is absent or disabled
- **THEN** the orchestrator opens no listener

#### Scenario: Loopback is the default bind address

- **WHEN** the status listener is enabled without an explicit host
- **THEN** it binds to `127.0.0.1`

#### Scenario: An explicit non-loopback host is honored

- **WHEN** the status listener is enabled with an explicit non-loopback host
- **THEN** it binds to that host instead of loopback

#### Scenario: A one-shot run opens no listener

- **WHEN** the service runs a single poll cycle and exits
- **THEN** it starts no status listener

### Requirement: Status reads do not exhaust provider rate limits

The status server SHALL bound how often it reads the provider for a repeated
view, so refreshing the overview cannot exhaust the configured provider rate
limits.

#### Scenario: Repeated requests reuse a snapshot

- **WHEN** the overview is requested repeatedly within the refresh interval
- **THEN** the provider is read at most once for those requests

#### Scenario: Concurrent requests share one snapshot

- **WHEN** several requests arrive while a snapshot is being built
- **THEN** they are served the same snapshot instead of each reading the provider

### Requirement: Status overview never reveals secrets

The status overview SHALL NOT include credentials, tokens, or other secret
values in either the HTML page or the JSON document.

#### Scenario: Credentials are absent from the output

- **WHEN** the overview is served for a repository that uses a credential
- **THEN** the credential value does not appear in the response
