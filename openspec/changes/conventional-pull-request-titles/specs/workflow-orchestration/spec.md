# Spec Delta

## MODIFIED Requirements

### Requirement: Workflow pull request title summarizes its change

When the orchestrator creates the draft pull request for a workflow, its title
SHALL be a Conventional Commit subject of the form
`<type>(<scope>): <summary>`, where `type` and optional `scope` come from the
repository's `pullRequest` configuration (`feat` and no scope by default) and
`summary` is the workflow's issue title. When the issue title already begins
with a Conventional Commit prefix, the orchestrator SHALL use it unchanged. The
title SHALL NOT be a generated marker that repeats the issue number.

#### Scenario: Created pull request title summarizes its change

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the title of the created draft pull request is
  `<type>(<scope>): <summary>` with the configured type and scope and the
  issue title as the summary

#### Scenario: Default type applies

- **WHEN** the repository configures no pull request title type
- **THEN** the created draft pull request's title begins with `feat`

#### Scenario: Configured scope is applied

- **WHEN** the repository configures a pull request title scope
- **THEN** the created draft pull request's title begins with
  `<type>(<scope>):`

#### Scenario: Already-conventional issue title is preserved

- **WHEN** the issue title already begins with a Conventional Commit prefix
- **THEN** the created draft pull request's title is that issue title unchanged

#### Scenario: Title does not repeat the issue number

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the created draft pull request's title carries no generated
  `OpenSpec change for issue #<n>` marker

#### Scenario: Merging keeps the conventional subject

- **WHEN** a workflow pull request titled with a Conventional Commit subject is
  squash-merged into the host's default branch
- **THEN** the resulting commit subject is that Conventional Commit subject
