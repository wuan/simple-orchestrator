# Spec Delta

## ADDED Requirements

### Requirement: Ready-for-review after implementation
After the apply turn finishes successfully - having implemented the change's
tasks and archived the change - and its commits are published, the orchestrator
SHALL mark the workflow's pull request ready for review so a human can review
and merge the implementation, and SHALL fail the workflow when the pull request
cannot be released from draft.

#### Scenario: Implementation is applied
- **WHEN** an apply turn finishes successfully, having implemented and archived
  the change, and its commits are published
- **THEN** the orchestrator marks the pull request ready for review

#### Scenario: Pull request is already ready
- **WHEN** the pull request is already ready for review
- **THEN** marking it ready is a no-op and the workflow advances

#### Scenario: Marking ready fails
- **WHEN** the pull request cannot be marked ready for review
- **THEN** the orchestrator marks the workflow failed and reports the error on
  the pull request
