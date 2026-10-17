# Spec Delta

## ADDED Requirements

### Requirement: Workflow pull request references its issue

When the orchestrator creates the draft pull request for a workflow, its body
SHALL include a host-recognized closing reference to the workflow's issue (for
example `Closes #<n>`) alongside the pull request's short description, so the
host links the pull request to the issue and closes the issue when the pull
request is merged.

#### Scenario: Created pull request references its issue

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the body of the created draft pull request contains a closing
  reference to that issue

#### Scenario: Merging the pull request closes the issue

- **WHEN** a workflow pull request whose body carries the closing reference is
  merged into the host's default branch
- **THEN** the host closes the referenced issue
