# Spec Delta

## ADDED Requirements

### Requirement: Ready-for-review operation
The provider interface SHALL expose an operation that marks a pull request (or
merge request) ready for review, so the orchestrator can release an implemented
change for review and merge without host-specific code.

#### Scenario: A draft pull request is readied
- **WHEN** the orchestrator asks the provider to mark a pull request ready for
  review
- **THEN** the provider releases it from draft through the host's API

#### Scenario: The operation is idempotent
- **WHEN** the orchestrator marks a pull request that is already ready for review
- **THEN** the provider succeeds without changing it

### Requirement: GitHub ready-for-review
The GitHub provider SHALL release a draft pull request for review, using the
host's GraphQL `markPullRequestReadyForReview` mutation, because GitHub exposes
no REST endpoint for the transition.

#### Scenario: GitHub pull request is readied
- **WHEN** the orchestrator marks a GitHub pull request ready for review
- **THEN** the provider resolves the pull request's node id and calls the
  markPullRequestReadyForReview mutation
