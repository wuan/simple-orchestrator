# Spec Delta

## MODIFIED Requirements

### Requirement: Cancellation
The orchestrator SHALL stop a workflow when the trigger label is removed or the pull request is closed without merge. When the pull request is closed without merge, the orchestrator SHALL also remove the trigger label from the issue, so a new workflow starts only when a human adds the label again.

#### Scenario: Trigger label removed
- **WHEN** the trigger label is removed from the issue
- **THEN** the orchestrator stops the workflow and takes no further turns

#### Scenario: Pull request closed without merge
- **WHEN** a workflow pull request is closed without being merged
- **THEN** the orchestrator clears its phase labels, removes the trigger label from the issue, posts a cancellation comment, and starts no new workflow for the issue

#### Scenario: A closed failed pull request is cancelled
- **WHEN** a pull request in the failed phase is closed without being merged while its issue still carries the trigger label
- **THEN** the orchestrator cancels it as above instead of starting a new workflow

#### Scenario: Re-adding the trigger label starts over
- **WHEN** a human adds the trigger label again to the issue of a cancelled, closed pull request
- **THEN** the orchestrator starts a new workflow with a new pull request

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
  closed without being merged and its workflow has already been cancelled
- **THEN** the orchestrator may start a new workflow for the issue

#### Scenario: The skip is reported
- **WHEN** verbose logging is enabled and a trigger-labeled issue is skipped
  because an associated pull request was merged
- **THEN** the poll output reports the issue and the merged pull request that
  resolved it
