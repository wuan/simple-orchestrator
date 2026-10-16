# Spec Delta

## ADDED Requirements

### Requirement: Turn commits are published before advancing
After a turn runs successfully, the orchestrator SHALL publish the workflow branch before recording the workflow's next phase, and SHALL fail the workflow when the publish fails.

#### Scenario: Successful turn is published
- **WHEN** a propose or apply turn finishes successfully
- **THEN** the workflow branch is pushed and the new phase is recorded

#### Scenario: Publish failure fails the workflow
- **WHEN** publishing the workflow branch fails
- **THEN** the orchestrator marks the workflow failed and reports the error on the pull request
