# Spec Delta

## ADDED Requirements

### Requirement: Integrate the base branch before a turn

The orchestrator SHALL integrate the current base branch into the workflow
branch before every turn, without rewriting the branch's published history, so
the turn works on top of the latest base and the pull request stays mergeable.

#### Scenario: Base advanced since the branch was cut

- **WHEN** a turn begins and the base branch has commits the workflow branch lacks
- **THEN** the provisioned workspace contains those base commits, integrated into
  the workflow branch

#### Scenario: Base already integrated

- **WHEN** a turn begins and the base branch is already an ancestor of the
  workflow branch
- **THEN** no new integration commit is created and the workspace is unchanged

#### Scenario: Integration conflicts

- **WHEN** integrating the base branch conflicts with the workflow branch
- **THEN** the workspace is left holding the unresolved integration so the turn
  can resolve it, instead of provisioning failing

#### Scenario: History is not rewritten

- **WHEN** the orchestrator integrates the base branch
- **THEN** it does not rewrite existing commits on the workflow branch
