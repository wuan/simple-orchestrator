# Spec Delta

## REMOVED Requirements

### Requirement: Workflow pull request references its issue

**Reason**: The pull request already identifies its issue: the issue number in
its title and body is a host reference that cross-references the pull request
and issue, so the dedicated `Closes #<n>` line is redundant. The behavior is
replaced by a requirement that makes the title summarize the change and the body
carry only the short description, without a host closing keyword.

**Migration**: None for pull requests the orchestrator creates from now on; they
omit the closing keyword and stay cross-referenced by the issue number. A pull
request created before this change keeps its body and can have the line removed
by hand.

## ADDED Requirements

### Requirement: Workflow pull request title summarizes its change

When the orchestrator creates the draft pull request for a workflow, its title
SHALL name the workflow's issue and include a short summary of the change drawn
from the issue, and its body SHALL carry the pull request's short description
and no host closing keyword such as `Closes #<n>`.

#### Scenario: Created pull request summarizes its change

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the title of the created draft pull request names the issue and
  includes a short summary of the change

#### Scenario: Created pull request omits a closing keyword

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the body of the created draft pull request carries the short
  description and no closing keyword

#### Scenario: Created pull request identifies its issue

- **WHEN** the orchestrator starts a workflow for a labeled issue
- **THEN** the issue number appears in the created draft pull request's title
  and body, so the host cross-references the pull request to the issue
