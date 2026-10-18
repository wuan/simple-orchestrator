# Spec Delta

## ADDED Requirements

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
