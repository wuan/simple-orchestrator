# Spec Delta

## MODIFIED Requirements

### Requirement: One change per issue behind a single pull request
Starting a workflow SHALL create a branch and exactly one draft pull request (or merge request) carrying the OpenSpec change, and each issue SHALL map to at most one active change. The branch SHALL start at the current base branch and SHALL NOT reuse a branch left behind by an earlier, inactive attempt.

#### Scenario: Workflow start creates the pull request
- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** it creates a branch containing an OpenSpec change and opens one draft pull request linked to the issue

#### Scenario: No duplicate pull request
- **WHEN** a workflow already has an active pull request for the issue
- **THEN** the orchestrator does not create a second one

#### Scenario: Branch starts at the current base
- **WHEN** the orchestrator starts a workflow for an issue with no active pull request
- **THEN** it bases the branch on the current base branch rather than on a branch left behind by an earlier attempt

## ADDED Requirements

### Requirement: An unintegrated base fails the workflow

The orchestrator SHALL fail a turn that finishes with the current base branch
not integrated into the workflow branch, marking the workflow failed and naming
the base branch, rather than pushing a stale branch or leaving an unmergeable
pull request.

#### Scenario: Turn leaves the base unintegrated

- **WHEN** a turn finishes and the current base branch is not an ancestor of the
  workflow branch (for example, unresolved merge conflicts were left behind)
- **THEN** the orchestrator fails the turn and marks the workflow failed, naming
  the base branch that could not be integrated

#### Scenario: Turn resolves the base integration

- **WHEN** a turn integrates the base branch, resolving any conflicts, and commits
- **THEN** the orchestrator pushes the branch and the workflow continues
