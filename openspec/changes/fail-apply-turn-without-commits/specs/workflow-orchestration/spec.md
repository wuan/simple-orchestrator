# Spec Delta

## ADDED Requirements

### Requirement: An apply turn that produces no change fails

When an apply turn completes without committing anything to the workflow branch,
the orchestrator SHALL treat the turn as failed, mark the workflow failed, and
report it, rather than marking the pull request ready for review and recording
the implementing phase, where no review drives the workflow again.

#### Scenario: Apply turn commits nothing

- **WHEN** an apply turn for an approved change finishes and the workflow branch
  tip is unchanged
- **THEN** the orchestrator does not publish the branch, marks the workflow
  failed, and reports the failure on the pull request

#### Scenario: Apply turn commits its implementation

- **WHEN** an apply turn implements and archives the change, committing to the
  workflow branch
- **THEN** the orchestrator publishes the branch, marks the pull request ready
  for review, and records the implementing phase
