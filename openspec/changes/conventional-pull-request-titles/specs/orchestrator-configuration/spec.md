# Spec Delta

## ADDED Requirements

### Requirement: Configurable pull request title

The orchestrator SHALL accept an optional `pullRequest` block on a repository
entry and in `defaults`, naming a Conventional Commit `type` and an optional
`scope` used for the repository's workflow pull request titles. `type` SHALL
default to `feat` and the scope SHALL default to absent. The orchestrator SHALL
fail startup, naming the repository, when `type` is not a documented
Conventional Commit type, or when `type` or `scope` is empty.

#### Scenario: Default title type applies

- **WHEN** a repository entry configures no `pullRequest` block
- **THEN** its workflow pull request titles use `feat` and no scope

#### Scenario: Configured type and scope apply

- **WHEN** a repository configures a `pullRequest` type and scope
- **THEN** its workflow pull request titles use that type and scope

#### Scenario: Entry inherits a default

- **WHEN** `defaults` sets a `pullRequest` type and scope and a repository entry
  omits them
- **THEN** that entry inherits the default type and scope

#### Scenario: Entry overrides a default

- **WHEN** `defaults` sets a `pullRequest` type and scope and a repository entry
  sets different ones
- **THEN** that entry uses its own type and scope

#### Scenario: Unknown type fails startup

- **WHEN** a `pullRequest` block names a type outside the documented
  Conventional Commit types
- **THEN** startup fails with an error naming the repository

#### Scenario: Empty field fails startup

- **WHEN** a `pullRequest` block has an empty type or an empty scope
- **THEN** startup fails with an error naming the repository
