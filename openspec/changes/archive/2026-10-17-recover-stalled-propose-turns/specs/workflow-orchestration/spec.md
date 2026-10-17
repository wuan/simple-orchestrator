# Spec Delta

## ADDED Requirements

### Requirement: A propose turn that produces no change fails

When a propose turn runs without a triggering review (the initial turn or a
recovery) and completes without committing anything to the workflow branch, the
orchestrator SHALL treat the turn as failed, mark the workflow failed, and
report it, rather than leaving the change in PROPOSING where no review will
drive it.

#### Scenario: Initial propose turn commits nothing

- **WHEN** the initial propose turn for a workflow finishes and the workflow
  branch tip is unchanged
- **THEN** the orchestrator marks the workflow failed and reports the failure on
  the pull request

#### Scenario: Stalled workflow is retried once per process

- **WHEN** a propose turn fails because it produced no change
- **THEN** the workflow is marked failed and the recovery path re-runs the
  propose turn at most once per process

#### Scenario: Review-driven revise turn may be a no-op

- **WHEN** a revise turn triggered by review feedback finishes without committing
  anything because there is nothing to change
- **THEN** the orchestrator does not fail the workflow for that reason and the
  workflow keeps its phase
