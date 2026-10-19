# Spec Delta

## ADDED Requirements

### Requirement: Pull request title update

The provider interface SHALL expose an operation that updates a pull request's
title, so the orchestrator can reconcile it with the applied outcome without
host-specific code.

#### Scenario: A title is updated

- **WHEN** the orchestrator asks the provider to update a pull request's title
- **THEN** the provider sets the title through the host's API

#### Scenario: A second provider is added

- **WHEN** a new host provider is implemented against the interface
- **THEN** it can update a pull request's title without changes to core
  orchestration

### Requirement: GitHub pull request title update

The GitHub provider SHALL update a pull request's title through the REST
`PATCH /repos/{owner}/{repo}/pulls/{number}` endpoint.

#### Scenario: GitHub title is updated

- **WHEN** the orchestrator updates a GitHub pull request's title
- **THEN** the provider PATCHes that pull request with the new title
