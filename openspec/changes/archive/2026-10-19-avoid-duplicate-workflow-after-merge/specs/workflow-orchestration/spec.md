# Spec Delta

## ADDED Requirements

### Requirement: A merged workflow is not started again
The orchestrator SHALL NOT start a new workflow for a trigger-labeled issue when
a pull request associated with that issue has already been merged, even if the
host has not yet closed the issue. A pull request closed without being merged
SHALL NOT resolve the issue.

#### Scenario: Merged workflow pull request is not restarted
- **WHEN** a trigger-labeled issue's workflow pull request has been merged and
  the host has not yet closed the issue
- **THEN** the orchestrator starts no workflow and creates no second pull
  request for that issue

#### Scenario: Issue without a pull request still starts
- **WHEN** a trigger-labeled issue has no pull request associated with it
- **THEN** the orchestrator starts a workflow as before

#### Scenario: Closed-without-merge pull request still starts
- **WHEN** the only pull request associated with a trigger-labeled issue was
  closed without being merged
- **THEN** the orchestrator may start a new workflow for the issue

#### Scenario: The skip is reported
- **WHEN** verbose logging is enabled and a trigger-labeled issue is skipped
  because an associated pull request was merged
- **THEN** the poll output reports the issue and the merged pull request that
  resolved it
