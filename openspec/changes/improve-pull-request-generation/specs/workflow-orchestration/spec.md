# Spec Delta

## MODIFIED Requirements

### Requirement: Workflow pull request references its issue

When the orchestrator creates the draft pull request for a workflow, its body
SHALL include a host-recognized closing reference to the workflow's issue (for
example `Closes #<n>`), so the host links the pull request to the issue and
closes the issue when the pull request is merged.

#### Scenario: Created pull request references its issue

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the body of the created draft pull request contains a closing
  reference to that issue

#### Scenario: Merging the pull request closes the issue

- **WHEN** a workflow pull request whose body carries the closing reference is
  merged into the host's default branch
- **THEN** the host closes the referenced issue

## ADDED Requirements

### Requirement: Workflow pull request title summarizes its change

When the orchestrator creates the draft pull request for a workflow, its title
SHALL be a short summary of the change drawn from the workflow's issue title,
and SHALL NOT be a generated marker that repeats the issue number.

#### Scenario: Created pull request title summarizes its change

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the title of the created draft pull request is a short summary of
  the change drawn from the issue's title

#### Scenario: Title does not repeat the issue number

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the created draft pull request's title carries the change summary
  and no generated `OpenSpec change for issue #<n>` marker
