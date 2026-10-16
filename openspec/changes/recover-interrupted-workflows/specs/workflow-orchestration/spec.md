# Spec Delta

## ADDED Requirements

### Requirement: Recover interrupted workflows
When an issue carries the trigger label and already has an open pull request that is not in an in-flight phase, the orchestrator SHALL re-run the propose turn for that pull request rather than treating the issue as permanently blocked, and SHALL attempt recovery at most once per pull request per process.

#### Scenario: Failed workflow is recovered
- **WHEN** a trigger-labeled issue has an open pull request in the FAILED phase
- **THEN** the orchestrator runs the propose turn for that pull request once

#### Scenario: Interrupted workflow is recovered
- **WHEN** a trigger-labeled issue has an open pull request with no lifecycle phase
- **THEN** the orchestrator runs the propose turn for that pull request once

#### Scenario: Recovery is bounded per process
- **WHEN** the orchestrator has already attempted recovery for a pull request in the current process
- **THEN** it takes no further action for that pull request

#### Scenario: In-flight workflows are left alone
- **WHEN** the open pull request already carries an in-flight phase
- **THEN** the orchestrator leaves it to the normal review-driven discovery and does not recover it
